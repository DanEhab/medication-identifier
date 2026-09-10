// Dark mode: read in bed without a flashbang.
//
// Driven through prefers-color-scheme rather than by setting the class, so what
// is under test is the path a real phone takes.
//
// The interesting check is not "is the background dark" — it is contrast. A
// palette swap that misses one element leaves black text on a dark card or a
// white card in the middle of a dark page, and both are invisible in a
// screenshot diff but obvious to anyone actually using it.
import { openApp, check, finish, screenshot, BASE } from './_harness.mjs';

const PATIENT = {
  drugName: 'Lipitor', canonicalName: 'Atorvastatin calcium', brandName: 'Lipitor',
  strength: '20 mg film-coated tablet',
  whatItIsFor: 'Lowers bad cholesterol to cut your risk of a heart attack or stroke.',
  commonUse: 'x', howToTake: 'Swallow whole with water.', dosageAdministration: 'One daily.',
  foodDrinkEffect: 'Avoid grapefruit juice.', missedDose: 'Skip it.',
  tellYourDoctorIf: 'you get unexplained muscle pain, tenderness or weakness.',
  neverWith: 'Grapefruit juice · clarithromycin · some HIV medicines',
  quickDose: '1 tablet', quickDoseNote: 'a day', quickTiming: 'Any time',
  quickTimingNote: 'same hour', quickFood: 'Food', quickFoodNote: 'not needed',
  commonSideEffects: ['Headache', 'Muscle aches'], seriousSideEffects: ['Rhabdomyolysis'],
  consultDoctorWhen: ['Dark urine'], storage: 'Below 25 °C.', recognition: 'medication',
};

const CLINICAL = {
  genericName: 'Atorvastatin', atcCode: 'C10AA05',
  formAndStrength: 'calcium trihydrate · 20 mg f/c tab',
  drugClass: 'HMG-CoA reductase inhibitor (statin)',
  mechanism: 'Competitively inhibits HMG-CoA reductase.',
  pharmacokinetics: 'Oral bioavailability ~14%. CYP3A4. t½ 14 h.',
  contraindications: 'Active hepatic disease.',
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin'],
  monitoring: 'Lipid panel at 4-12 weeks.',
};

const NOT_A_MEDICINE = {
  recognition: 'substance',
  identifiedAs: 'It looks like a flavoured drink, so there is nothing here we can tell you about safely.',
  safetyNote: '', drugName: '', strength: '', commonUse: '', dosageAdministration: '',
  foodDrinkEffect: '', missedDose: '', storage: '',
  commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [],
};

const browser = await openApp({ dark: true, patient: PATIENT, clinical: CLINICAL });

/**
 * Walks the visible text and checks each run against the background actually
 * behind it, plus looks for any large pale surface that survived the swap.
 */
const audit = (label) => browser.evaluate(`
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

  // The colour actually painted behind an element, walking up through
  // transparent ancestors and compositing any translucent layers on the way.
  const backdrop = (el) => {
    const stack = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a === 1) break;
      }
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

    // A pale block of any size is the flashbang this theme exists to avoid.
    const own = parse(style.backgroundColor);
    if (own && own.a > 0.5 && rect.width * rect.height > 4000) {
      const solid = over(own, backdrop(el.parentElement || document.body));
      if (lum(solid) > 0.5) {
        paleSurfaces.push({
          cls: (el.className && el.className.toString().slice(0, 48)) || el.tagName,
          colour: style.backgroundColor,
          area: Math.round(rect.width * rect.height),
        });
      }
    }

    // Text runs, checked against what is behind them.
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const fg = parse(style.color);
    if (!fg || fg.a === 0) continue;
    const bg = backdrop(el);
    const ratio = contrast(over(fg, bg), bg);
    if (ratio < 3) {
      lowContrast.push({ text: text.slice(0, 28), fg: style.color, ratio: ratio.toFixed(2) });
    }
  }

  return {
    isDark: document.documentElement.classList.contains('dark'),
    colorScheme: document.documentElement.style.colorScheme,
    ground: getComputedStyle(document.body).backgroundColor,
    lowContrast: lowContrast.slice(0, 4),
    paleSurfaces: paleSurfaces.slice(0, 4),
  };
`).then((r) => {
  check(`${label}: the dark theme is on`, r.isDark, `class=${r.isDark} scheme=${r.colorScheme}`);
  check(`${label}: the ground is the dark one`, r.ground === 'rgb(8, 32, 31)', r.ground);
  check(`${label}: nothing pale survived the swap`, r.paleSurfaces.length === 0,
    JSON.stringify(r.paleSurfaces));
  check(`${label}: every text run is legible on what is behind it`, r.lowContrast.length === 0,
    JSON.stringify(r.lowContrast));
  return r;
});

const goHome = () => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 800));
  return document.querySelector('[data-tutorial="my-medicines"]') ? 'ok' : document.body.innerText.slice(0, 120);
`);

const search = (term) => browser.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button';
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="detail-chips"]') || /not a medicine|could not read/i.test(document.body.innerText)) return 'ok';
  }
  return document.body.innerText.slice(0, 150);
`);

await browser.goto(BASE);
check('the app follows the phone into dark mode with nothing stored', (await goHome()) === 'ok');
await audit('camera');
await screenshot(browser, 'dark-camera', import.meta.url);

check('a search reaches the result screen', (await search('Lipitor')) === 'ok');
await audit('result');

// The design's own dark values, spot-checked where they matter most.
const palette = await browser.evaluate(`
  const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
  const save = document.querySelector('[data-tutorial="save-medicine"]');
  const fact = document.querySelector('[data-tutorial="quick-facts"] > div');
  return {
    washBg: getComputedStyle(wash).backgroundColor,
    saveBg: getComputedStyle(save).backgroundColor,
    saveFg: getComputedStyle(save).color,
    factBg: getComputedStyle(fact).backgroundColor,
    h1: getComputedStyle(document.querySelector('h1')).color,
  };
`);
check('the teal wash is the translucent one, not the light tint',
  palette.washBg === 'rgba(127, 189, 180, 0.16)', palette.washBg);
check('the primary button lightens and its text darkens',
  palette.saveBg === 'rgb(127, 189, 180)' && palette.saveFg === 'rgb(6, 35, 31)',
  `${palette.saveBg} / ${palette.saveFg}`);
check('cards sit on the raised surface', palette.factBg === 'rgb(15, 46, 45)', palette.factBg);
check('the headline is the light ink', palette.h1 === 'rgb(237, 243, 241)', palette.h1);

await screenshot(browser, 'dark-result', import.meta.url);

// ── The rest of the screens ────────────────────────────────────────────────
await browser.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 800));
`);
await audit('side effects');
await screenshot(browser, 'dark-sideeffects', import.meta.url);

await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) break;
  }
`);
await audit('professional');
await screenshot(browser, 'dark-professional', import.meta.url);

await browser.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('[data-tutorial="save-medicine"]').click();
  await new Promise(r => setTimeout(r, 500));
  [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('[data-tutorial="my-medicines"]').click();
  await new Promise(r => setTimeout(r, 800));
`);
await audit('my medicines');
await screenshot(browser, 'dark-medicines', import.meta.url);

await browser.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 800));
`);
await audit('search');

await browser.goto(BASE);
await goHome();
await browser.evaluate(`window.__patient = ${JSON.stringify(NOT_A_MEDICINE)};`);
await search('vitamin water');
await audit('not a medicine');

await browser.evaluate(`localStorage.removeItem('disclaimerAccepted');`);
await browser.goto(BASE);
await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2500));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
`);
await audit('first run');

// ── An explicit choice still beats the phone ──────────────────────────────
const override = await browser.evaluate(`
  localStorage.setItem('app-theme', 'light');
  location.reload();
`).catch(() => {});
await new Promise((r) => setTimeout(r, 3500));
const stored = await browser.evaluate(`
  await new Promise(r => setTimeout(r, 1500));
  return {
    isDark: document.documentElement.classList.contains('dark'),
    ground: getComputedStyle(document.body).backgroundColor,
    systemSaysDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  };
`);
check('a stored light choice wins over a dark phone',
  !stored.isDark && stored.systemSaysDark, JSON.stringify(stored));
check('and the ground goes back to paper', stored.ground === 'rgb(247, 243, 236)', stored.ground);

await finish(browser);
