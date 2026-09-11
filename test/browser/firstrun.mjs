// The disclaimer, accepted once — the first thing anybody ever sees.
//
// This screen had no suite of its own, which is how it came to be white text
// on a white ground in dark mode without anything noticing: it is the only
// screen that is deliberately dark in *both* themes, so it is the only one
// where using the text colour as a background inverts underneath you.
import { openApp, check, finish, screenshot, BASE, reachFirstRun } from './_harness.mjs';

const browser = await openApp({ firstRun: true });
check('the disclaimer is shown on a fresh install', (await reachFirstRun(browser)) === 'ok');

// ── It says the right thing ───────────────────────────────────────────────
const wording = await browser.evaluate(`
  const dialog = document.querySelector('[role="dialog"]');
  const body = dialog.querySelector('p');
  return {
    text: body.textContent.replace(/\\s+/g, ' ').trim(),
    emphasised: [...body.querySelectorAll('strong')].map(s => s.textContent.trim()),
    modal: dialog.getAttribute('aria-modal'),
    labelled: !!document.getElementById(dialog.getAttribute('aria-labelledby')),
  };
`);
check('the disclaimer reads as agreed',
  wording.text === 'This app explains medicines in plain language. It provides information, not medical advice. '
    + 'While we strive for accuracy, it never replaces your pharmacist or doctor.',
  wording.text);
check('the clause that matters is the emphasised one',
  wording.emphasised.length === 1 && wording.emphasised[0] === 'information, not medical advice',
  JSON.stringify(wording.emphasised));
check('it is a labelled modal dialog', wording.modal === 'true' && wording.labelled);

// ── Nothing on it is invisible, in either theme ───────────────────────────
const legibility = (target) => target.evaluate(`
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const backdrop = (el) => {
    const stack = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) result = over(stack[i], result);
    return result;
  };

  const dialog = document.querySelector('[role="dialog"]');
  const bad = [];
  for (const el of dialog.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (!fg || fg.a === 0) continue;
    const bg = backdrop(el);
    const ratio = contrast(over(fg, bg), bg);
    if (ratio < 3) bad.push({ text: text.slice(0, 30), fg: style.color, ratio: ratio.toFixed(2) });
  }
  return {
    ground: getComputedStyle(dialog).backgroundColor,
    bad,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);

const light = await legibility(browser);
check('the ground is the fixed dark one, not the inverting ink',
  light.ground === 'rgb(6, 35, 31)', light.ground);
check('every word on it is legible in light mode', light.bad.length === 0, JSON.stringify(light.bad));
check('nothing overflows', !light.overflows);

await screenshot(browser, 'firstrun-en', import.meta.url);

// ── The language buttons keep their places ────────────────────────────────
const buttons = () => browser.evaluate(`
  const row = [...document.querySelectorAll('[role="dialog"] button')].slice(1);
  return row.map(b => ({
    label: b.textContent.trim(),
    left: Math.round(b.getBoundingClientRect().left),
    pressed: b.getAttribute('aria-pressed') === 'true',
    fill: getComputedStyle(b).backgroundColor,
  }));
`);

const before = await buttons();
check('English is on the left to start with',
  before[0].label === 'English' && before[0].left < before[1].left, JSON.stringify(before));
check('and it is the selected one', before[0].pressed && !before[1].pressed);

const after = await browser.evaluate(`
  const arabic = [...document.querySelectorAll('[role="dialog"] button')]
    .find(b => b.textContent.trim() === 'العربية');
  arabic.click();
  await new Promise(r => setTimeout(r, 700));
  const row = [...document.querySelectorAll('[role="dialog"] button')].slice(1);
  return {
    dir: document.documentElement.dir,
    buttons: row.map(b => ({
      label: b.textContent.trim(),
      left: Math.round(b.getBoundingClientRect().left),
      pressed: b.getAttribute('aria-pressed') === 'true',
      fill: getComputedStyle(b).backgroundColor,
    })),
  };
`);
check('switching to Arabic mirrors the page', after.dir === 'rtl', after.dir);
check('but the buttons stay where they were',
  after.buttons[0].label === 'English' &&
  after.buttons[0].left === before[0].left &&
  after.buttons[1].left === before[1].left,
  JSON.stringify(after.buttons));
check('only the fill moves',
  !after.buttons[0].pressed && after.buttons[1].pressed &&
  after.buttons[1].fill === before[0].fill,
  JSON.stringify(after.buttons.map((b) => `${b.label}:${b.pressed}`)));

const arabicWording = await browser.evaluate(`
  const body = document.querySelector('[role="dialog"] p');
  return body.textContent.replace(/\\s+/g, ' ').trim();
`);
check('the Arabic disclaimer reads as agreed',
  arabicWording === 'يشرح هذا التطبيق الأدوية بلغة مبسطة. يقدم التطبيق معلومات وليس نصيحة طبية. '
    + 'رغم سعينا للدقة، فإنه لا يغني أبداً عن استشارة الصيدلي أو الطبيب.',
  arabicWording);

const arabicLegibility = await legibility(browser);
check('every word is legible in Arabic too', arabicLegibility.bad.length === 0, JSON.stringify(arabicLegibility.bad));
check('nothing overflows in Arabic', !arabicLegibility.overflows);

await screenshot(browser, 'firstrun-ar', import.meta.url);

// ── Accepting ─────────────────────────────────────────────────────────────
const accepted = await browser.evaluate(`
  const accept = document.querySelector('[role="dialog"] button');
  accept.click();
  await new Promise(r => setTimeout(r, 900));
  return {
    gone: !document.querySelector('[role="dialog"]'),
    onCamera: !!document.querySelector('[data-tutorial="my-medicines"]'),
    remembered: localStorage.getItem('disclaimerAccepted'),
    language: localStorage.getItem('app-language'),
  };
`);
check('accepting takes you into the app', accepted.gone && accepted.onCamera, JSON.stringify(accepted));
check('and it is remembered', accepted.remembered === 'true');
check('with the language that was chosen', accepted.language === 'ar', String(accepted.language));

const second = await browser.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 3600));
const shownAgain = await browser.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  return { dialog: !!document.querySelector('[role="dialog"]') };
`);
check('and never shown again', !shownAgain.dialog);

// ── The same screen on a phone in dark mode ──────────────────────────────
//
// The reason this suite exists. Every other screen flips; this one must not,
// and the way it broke was by using the text colour as its background.
const night = await openApp({ firstRun: true, dark: true });
check('the disclaimer is shown in dark mode too', (await reachFirstRun(night)) === 'ok');

const dark = await legibility(night);
check('its ground is the same fixed dark in both themes',
  dark.ground === 'rgb(6, 35, 31)', dark.ground);
check('and every word on it is still legible', dark.bad.length === 0, JSON.stringify(dark.bad));

const darkAccept = await night.evaluate(`
  const accept = document.querySelector('[role="dialog"] button');
  return { bg: getComputedStyle(accept).backgroundColor, fg: getComputedStyle(accept).color };
`);
check('the continue button is not white on white',
  darkAccept.bg === 'rgb(255, 255, 255)' && darkAccept.fg === 'rgb(6, 35, 31)',
  JSON.stringify(darkAccept));

await screenshot(night, 'firstrun-dark', import.meta.url);
await night.close();

await finish(browser);
