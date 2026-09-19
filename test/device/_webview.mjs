// Attaches to the app's WebView on the emulator through the adb-forwarded
// DevTools port, so the real thing can be inspected rather than guessed at.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = process.env.WV_PORT || 9333;

/*
  The version the build stamps on a dismissed disclaimer or a finished tour.

  Every suite seeds those keys so it can get to the screen it is actually
  testing. Seeding them with a literal means the suites go on claiming the
  tour was dismissed by a build that is no longer the one installed — and the
  whole run opens on a disclaimer instead. Read it from package.json, which is
  the same file vite injects as __APP_VERSION__.
*/
export const APP_VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
).version;

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('no debuggable page in the WebView');
  return page.webSocketDebuggerUrl;
}

export async function connectWebView() {
  const url = await target();
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('could not open the devtools socket'));
  });

  ws.onmessage = (raw) => {
    const msg = JSON.parse(raw.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      return;
    }
    for (const l of listeners) if (l.event === msg.method) l.fn(msg.params);
  };

  const send = (method, params = {}) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => {
      pending.set(id, { res, rej });
      setTimeout(() => { if (pending.delete(id)) rej(new Error(`${method} timed out`)); }, 180000);
    });
  };

  /*
    Wait for the app to be on screen before handing the handle back.

    The devtools socket exists well before the page does, so a suite could
    connect, write its localStorage and call location.reload() while the
    *initial* navigation was still in flight — and that navigation then
    replaced the page, throwing the reload away. The app came up with whatever
    the previous suite had left in storage.

    That failed silently and only in the runner, because running a suite by
    hand leaves seconds of slack before it connects. It looked like a bug in
    whatever the suite was measuring: the tour reporting no tour on a fresh
    install, and the English suites finding no English button because the app
    was still in Arabic.

    Three readings in a row, because `complete` can be reported for the empty
    document a moment before the bundle runs.
  */
  let settled = 0;
  for (let attempt = 0; attempt < 160 && settled < 3; attempt++) {
    try {
      const r = await send('Runtime.evaluate', {
        expression: "document.readyState === 'complete' && !!document.querySelector('#root > *')",
        returnByValue: true,
      });
      settled = r.result?.value === true ? settled + 1 : 0;
    } catch {
      settled = 0;
    }
    if (settled < 3) await new Promise((r) => setTimeout(r, 250));
  }

  return {
    send,
    on: (event, fn) => listeners.push({ event, fn }),
    async evaluate(expression) {
      // A freshly launched WebView tears its execution context down and builds
      // a new one as the page loads, so an early evaluate can land in a context
      // that no longer exists. Retry briefly rather than treating that as a
      // failure of whatever is being measured.
      let lastError;
      for (let attempt = 0; attempt < 25; attempt++) {
        try {
          const r = await send('Runtime.evaluate', {
            expression: `(async () => { ${expression} })()`,
            awaitPromise: true,
            returnByValue: true,
          });
          if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
          }
          return r.result.value;
        } catch (error) {
          lastError = error;
          if (!/context was destroyed|Cannot find context|Inspected target/i.test(String(error.message))) throw error;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      throw lastError;
    },
    close: () => ws.close(),
  };
}
