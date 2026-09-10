// Attaches to the app's WebView on the emulator through the adb-forwarded
// DevTools port, so the real thing can be inspected rather than guessed at.
const PORT = process.env.WV_PORT || 9333;

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
