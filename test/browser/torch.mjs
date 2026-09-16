// The flash button.
//
// It has never been possible to prove this end to end: no emulator has a lamp,
// and the emulator's camera does not even report a torch capability, so the
// button is correctly disabled there and nothing is exercised. What can be
// proved is the half the app owns — that the button enables only when the
// track says it can, that pressing it asks for the constraint the specification
// defines, that the button reports what it asked for, and that leaving the app
// puts the lamp out rather than leaving a phone shining in a pocket.
//
// The remaining half is the phone's: whether applyConstraints actually lights
// the LED. No test here can speak for that.
import { openApp, check, finish, reachCamera } from './_harness.mjs';

const flash = (browser) => browser.evaluate(`
  const btn = [...document.querySelectorAll('button')]
    .find(b => /^(Flash|الفلاش)$/.test(b.getAttribute('aria-label') || ''));
  if (!btn) return null;
  return {
    disabled: btn.disabled,
    pressed: btn.getAttribute('aria-pressed') === 'true',
    calls: (window.__torchCalls || []).map(c => JSON.stringify(c)),
  };
`);

// ── Without a torch, the button says so rather than lying ─────────────────
{
  const browser = await openApp({});
  check('the camera is reached', (await reachCamera(browser)) === 'ok');
  const off = await flash(browser);
  check('the flash button is on the screen', off !== null, JSON.stringify(off));
  // Headless Chrome has no camera at all, so this is the no-capability path.
  check('and is disabled when the camera reports no torch', off.disabled, JSON.stringify(off));
  check('and is not claiming to be on', !off.pressed);
  await browser.close();
}

// ── With one, it works ────────────────────────────────────────────────────
const browser = await openApp({ torch: true });
check('the camera is reached with a torch-capable track', (await reachCamera(browser)) === 'ok');

const ready = await flash(browser);
check('the button is enabled when the track reports a torch', ready && !ready.disabled, JSON.stringify(ready));
check('and starts off', !ready.pressed);
check('and nothing has been asked of the lamp yet', ready.calls.length === 0, JSON.stringify(ready.calls));

const pressed = await browser.evaluate(`
  [...document.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Flash').click();
  await new Promise(r => setTimeout(r, 400));
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Flash');
  return {
    pressed: btn.getAttribute('aria-pressed') === 'true',
    calls: window.__torchCalls.map(c => JSON.stringify(c)),
    // Filled teal is how the screen says it is lit.
    background: getComputedStyle(btn).backgroundColor,
  };
`);
// `advanced` is how the specification carries a constraint the browser may not
// know; a bare { torch: true } is silently ignored where it is not recognised.
check('pressing it asks the track for the torch',
  pressed.calls.length === 1 && pressed.calls[0] === JSON.stringify({ advanced: [{ torch: true }] }),
  JSON.stringify(pressed.calls));
check('and the button reports it as on', pressed.pressed);
check('and looks it', pressed.background === 'rgb(10, 90, 86)', pressed.background);

const again = await browser.evaluate(`
  [...document.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === 'Flash').click();
  await new Promise(r => setTimeout(r, 400));
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Flash');
  return { pressed: btn.getAttribute('aria-pressed') === 'true', calls: window.__torchCalls.map(c => JSON.stringify(c)) };
`);
check('pressing again asks for it off',
  again.calls.length === 2 && again.calls[1] === JSON.stringify({ advanced: [{ torch: false }] }),
  JSON.stringify(again.calls));
check('and the button reports it as off', !again.pressed);

// ── Leaving the app puts it out ───────────────────────────────────────────
/*
  Disabling a track does not turn the lamp off, and the screen only disabled
  the track. Someone who lit the torch to read a box in a dim cupboard and then
  switched apps would have left their phone shining in their pocket.
*/
const backgrounded = await browser.evaluate(`
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Flash');
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const litCalls = window.__torchCalls.length;

  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise(r => setTimeout(r, 400));

  const after = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Flash');
  return {
    litCalls,
    calls: window.__torchCalls.map(c => JSON.stringify(c)),
    stillPressed: after.getAttribute('aria-pressed') === 'true',
  };
`);
check('the torch was lit before leaving', backgrounded.litCalls === 3, String(backgrounded.litCalls));
check('leaving the app turns it off',
  backgrounded.calls.length === 4
  && backgrounded.calls[3] === JSON.stringify({ advanced: [{ torch: false }] }),
  JSON.stringify(backgrounded.calls));
check('and the button no longer claims it is on', !backgrounded.stillPressed);

await finish(browser);
