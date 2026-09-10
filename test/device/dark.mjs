// Dark mode on the emulator, with the device itself in night mode. Nothing
// tells the app to be dark: it has to work that out from the phone, which is
// the whole path a real user takes.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

await wv.evaluate(`
  localStorage.setItem('disclaimerAccepted', 'true');
  localStorage.setItem('tutorial_version', '1.3.0');
  localStorage.setItem('tutorial_phase1_done', 'true');
  localStorage.setItem('tutorial_phase2_done', 'true');
  localStorage.setItem('app-language', 'en');
  localStorage.removeItem('app-theme');
  localStorage.removeItem('myMedications');
  return 'seeded';
`);

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const audit = (label) => wv.evaluate(`
  const parse = (colour) => {
    const m = colour.match(/rgba?\\(([^)]+)\\)/);
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
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const backdrop = (el) => {
    const stack = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
    }
    const root = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    let result = root.a === 1 ? root : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) result = over(stack[i], result);
    return result;
  };

  const lowContrast = [];
  const paleSurfaces = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;

    const own = parse(style.backgroundColor);
    if (own && own.a > 0.5 && rect.width * rect.height > 4000) {
      const solid = over(own, backdrop(el.parentElement || document.body));
      if (lum(solid) > 0.5) {
        paleSurfaces.push({ cls: (el.className && el.className.toString().slice(0, 40)) || el.tagName, colour: style.backgroundColor });
      }
    }

    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const fg = parse(style.color);
    if (!fg || fg.a === 0) continue;
    const bg = backdrop(el);
    const ratio = contrast(over(fg, bg), bg);
    if (ratio < 3) lowContrast.push({ text: text.slice(0, 26), fg: style.color, ratio: ratio.toFixed(2) });
  }

  return {
    isDark: document.documentElement.classList.contains('dark'),
    systemSaysDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    ground: getComputedStyle(document.body).backgroundColor,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    lowContrast: lowContrast.slice(0, 4),
    paleSurfaces: paleSurfaces.slice(0, 4),
  };
`).then((r) => {
  check(`${label}: the app followed the phone into dark`, r.isDark && r.systemSaysDark,
    `app=${r.isDark} phone=${r.systemSaysDark}`);
  check(`${label}: the ground is the dark one`, r.ground === 'rgb(8, 32, 31)', r.ground);
  check(`${label}: nothing pale survived`, r.paleSurfaces.length === 0, JSON.stringify(r.paleSurfaces));
  check(`${label}: every text run is legible`, r.lowContrast.length === 0, JSON.stringify(r.lowContrast));
  check(`${label}: nothing overflows`, !r.overflows);
  return r;
});

const first = await wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1200));
  return document.querySelector('[data-tutorial="my-medicines"]') ? 'ok' : document.body.innerText.slice(0, 150);
`);
check('the camera screen is reached', first === 'ok', String(first));
await audit('camera');

// A real lookup against the live API, in dark.
const looked = await wv.evaluate(`
  [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || '')).click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Lipitor 20mg');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="detail-chips"]')) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);
check('a real lookup reaches the result screen in dark', looked === 'ok', String(looked));
await audit('result');

await wv.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('side effects');

await wv.evaluate(`
  [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) break;
  }
`);
await audit('professional');

await wv.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="save-medicine"]').click();
  await new Promise(r => setTimeout(r, 600));
  [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="my-medicines"]').click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('my medicines');

await wv.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('search');

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
