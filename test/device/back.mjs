// The Android back button.
//
// This can only be a device suite. A headless Chrome has no hardware back key,
// and the bug being guarded against was not a wrong destination — it was the
// app closing. Capacitor's default onBackPressed finishes the activity without
// consulting the WebView's history, so pressing back while reading a medicine
// threw away an answer that had cost a network round trip to produce.
//
// So each check presses the real key with `adb shell input keyevent 4` and then
// asks two questions: is the app still the window on screen, and which of its
// screens is on top.
import { execSync } from 'node:child_process';
import { APP_VERSION, connectWebView } from './_webview.mjs';

const APP_ID = 'com.danehab.medicationidentifier';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

/**
 * Whether the app is still the thing on screen.
 *
 * Not whether its process is alive: Android keeps a finished app's process
 * around as a cached one, so `pidof` answers yes long after the user has been
 * dropped back at the launcher. The focused window is what the user sees.
 */
const inForeground = () => {
  try {
    const focus = execSync('adb shell dumpsys window', { encoding: 'utf8' })
      .split(/\r?\n/).find((line) => line.includes('mCurrentFocus')) || '';
    return focus.includes(APP_ID);
  } catch {
    return false;
  }
};

const wv = await connectWebView();

const press = async () => {
  execSync('adb shell input keyevent 4');
  await new Promise((r) => setTimeout(r, 1200));
};

/** Which screen is on top, named by something only that screen renders. */
const where = () => wv.evaluate(`
  const q = (sel) => !!document.querySelector(sel);
  if (q('[data-testid="tour"]')) return 'tour';
  if (q('#firstrun-title')) return 'firstrun';
  if (q('[data-testid="settings"]')) return 'settings';
  if (q('[data-testid="clinical-card"]')) return 'professional';
  if (q('[data-tutorial="quick-facts"]')) return 'results';
  if (q('[data-testid="profiles"]')) return 'medicines';
  if (q('input[type="search"]')) return 'search';
  if (q('[data-tutorial="shutter"]')) return 'home';
  return 'unknown: ' + document.body.innerText.slice(0, 80);
`).catch(() => 'gone');

const pastIntro = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const gone = await wv.evaluate(`
      const splash = document.querySelector('[aria-label="Skip introduction"]');
      if (!splash) return true;
      splash.click();
      await new Promise(r => setTimeout(r, 400));
      return !document.querySelector('[aria-label="Skip introduction"]');
    `).catch(() => false);
    if (gone) break;
  }
  await wv.evaluate(`await new Promise(r => setTimeout(r, 1500)); return 'ok';`).catch(() => {});
};

const reset = async () => {
  await wv.evaluate(`
    localStorage.setItem('disclaimerAcceptedVersion', '${APP_VERSION}');
    localStorage.setItem('tourSeenVersion1', '${APP_VERSION}');
    localStorage.setItem('tourSeenVersion2', '${APP_VERSION}');
    localStorage.setItem('app-language', 'en');
    location.reload();
  `).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));
  await pastIntro();
};

await reset();
check('the app starts on the camera', (await where()) === 'home');

// ── The three tabs all come back to the camera ─────────────────────────────
for (const tab of ['medicines', 'search']) {
  const reached = await wv.evaluate(`
    document.querySelector('[data-tab="${tab}"]').click();
    await new Promise(r => setTimeout(r, 900));
    return 'ok';
  `);
  check(`${tab} is reached`, reached === 'ok');
  await press();
  check(`back leaves ${tab} instead of the app`, inForeground());
  check(`and returns to the camera`, (await where()) === 'home');
}

// ── Settings ───────────────────────────────────────────────────────────────
await wv.evaluate(`
  document.querySelector('[data-testid="open-settings"]').click();
  await new Promise(r => setTimeout(r, 800));
  return 'ok';
`);
check('settings is reached', (await where()) === 'settings');
await press();
check('back leaves settings without closing the app', inForeground());
check('and returns to where settings was opened from', (await where()) === 'home');

// ── A medicine, which is the screen this cost the most on ──────────────────
const reached = await wv.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  typeBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Panadol');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form && input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="quick-facts"]')) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 160);
`);
check('a medicine is on screen', reached === 'ok', reached);

if (reached === 'ok') {
  // Down one more level first: back has to unwind, not jump to the top.
  const chips = await wv.evaluate(`
    document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
    await new Promise(r => setTimeout(r, 900));
    return /COMMON|SIDE EFFECTS/i.test(document.body.innerText) ? 'ok' : 'no';
  `);
  check('the side effects screen is reached', chips === 'ok', chips);
  await press();
  check('back from side effects keeps the app', inForeground());
  check('and returns to the medicine, not the camera', (await where()) === 'results');

  await press();
  check('back from the medicine keeps the app', inForeground());
  check('and returns to the camera', (await where()) === 'home');
}

// ── And from the camera it does close, which is what Android expects ───────
// Deliberately last: it takes the app off the screen.
await press();
check('back from the camera closes the app, as any Android app does', !inForeground());

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
