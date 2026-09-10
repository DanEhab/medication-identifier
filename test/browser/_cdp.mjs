// A minimal Chrome DevTools Protocol driver. Node 24 ships a WebSocket client,
// so this needs no dependencies at all.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function launch({ width = 390, height = 844 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'mi-chrome-'));
  const port = 9500 + Math.floor(Math.random() * 400);

  const proc = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    // Without these getUserMedia fails and the camera screen falls into its
    // "blocked" state, so anything that returns to it reads as broken.
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    'about:blank',
  ], { stdio: 'ignore' });

  // Wait for the debugging endpoint to answer.
  let wsUrl = null;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      wsUrl = (await res.json()).webSocketDebuggerUrl;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!wsUrl) throw new Error('Chrome did not expose a debugging port.');

  const browser = await connect(wsUrl);

  // Open a page target and attach to it with a flattened session.
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  const page = {
    send: (method, params = {}) => browser.send(method, params, sessionId),
    on: (event, fn) => browser.on(event, fn, sessionId),
  };

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: width < 700,
  });

  return {
    page,
    async setViewport(w, h) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 2, mobile: w < 700,
      });
    },
    async goto(url) {
      await page.send('Page.navigate', { url });
      await waitForLoad(page);
    },
    async evaluate(expression) {
      const result = await page.send('Runtime.evaluate', {
        expression: `(async () => { ${expression} })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
      }
      return result.result.value;
    },
    // Full-page capture leaves sticky elements at their viewport offset, so a
    // sticky header lands in the middle of the image and covers whatever is
    // behind it. Pass { fullPage: false } to photograph what is actually on
    // screen instead.
    async screenshot(path, { fullPage = true } = {}) {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, Buffer.from(data, 'base64'));
    },
    async close() {
      browser.close();
      proc.kill();
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

function waitForLoad(page) {
  return new Promise((resolve) => {
    const done = () => resolve();
    page.on('Page.loadEventFired', done);
    setTimeout(resolve, 8000);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 1;
    const pending = new Map();
    const listeners = [];

    ws.onopen = () =>
      resolve({
        send(method, params, sessionId) {
          const id = nextId++;
          const message = { id, method, params };
          if (sessionId) message.sessionId = sessionId;
          ws.send(JSON.stringify(message));
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            setTimeout(() => {
              if (pending.has(id)) {
                pending.delete(id);
                rej(new Error(`${method} timed out`));
              }
            }, 30000);
          });
        },
        on(event, fn, sessionId) {
          listeners.push({ event, fn, sessionId });
        },
        close: () => ws.close(),
      });

    ws.onerror = (e) => reject(new Error(`websocket error: ${e.message || 'unknown'}`));

    ws.onmessage = (raw) => {
      const message = JSON.parse(raw.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(message.error.message));
        else res(message.result);
        return;
      }
      for (const l of listeners) {
        if (l.event === message.method && (!l.sessionId || l.sessionId === message.sessionId)) {
          l.fn(message.params);
        }
      }
    };
  });
}
