// The Arabic pass: every screen, mirrored and set properly.
//
// Mirroring is the easy half and was already there. What this checks is the
// typography: no Latin mono face under Arabic text, no letter-spacing pulling
// joined letters apart, enough leading, and no Latin run reordered by the bidi
// algorithm into nonsense.
import { openApp, check, finish, screenshot, BASE } from './_harness.mjs';

const PATIENT = {
  drugName: 'Lipitor', canonicalName: 'Atorvastatin calcium', brandName: 'Lipitor',
  strength: '20 mg film-coated tablet',
  whatItIsFor: 'Lowers bad cholesterol to cut your risk of a heart attack or stroke.',
  commonUse: 'x', howToTake: 'Swallow whole with water.', dosageAdministration: 'One daily.',
  foodDrinkEffect: 'Avoid grapefruit juice.', missedDose: 'Skip it.',
  tellYourDoctorIf: 'you get unexplained muscle pain.',
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

const browser = await openApp({
  language: 'ar',
  patient: PATIENT,
  clinical: CLINICAL,
  storage: { recentSearches: JSON.stringify(['\u0628\u0646\u0627\u062f\u0648\u0644 \u0625\u0643\u0633\u062a\u0631\u0627', 'Metformin']) },
});

/**
 * The typographic audit, run against whatever screen is on the page.
 *
 * Every rule here is something that was actually wrong before this pass, or
 * that would be invisible in a screenshot until somebody who reads Arabic
 * looked at it.
 */
const audit = (label) => browser.evaluate(`
  const arabic = /[\\u0600-\\u06FF]/;
  const problems = [];

  // 1. Nothing containing Arabic may be set in a Latin monospace face, and
  //    nothing containing Arabic may carry letter-spacing.
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text || !arabic.test(text)) continue;
    const style = getComputedStyle(el);
    if (/mono/i.test(style.fontFamily)) {
      problems.push('mono face on Arabic: ' + text.slice(0, 24) + ' [' + style.fontFamily.slice(0, 40) + ']');
    }
    const spacing = parseFloat(style.letterSpacing);
    if (!Number.isNaN(spacing) && Math.abs(spacing) > 0.01) {
      problems.push('letter-spacing ' + style.letterSpacing + ' on Arabic: ' + text.slice(0, 24));
    }
  }

  // 2. Arabic paragraphs need leading. Anything under 1.55 reads as a block.
  for (const el of document.querySelectorAll('p')) {
    const text = (el.textContent || '').trim();
    if (!text || !arabic.test(text)) continue;
    const style = getComputedStyle(el);
    const ratio = parseFloat(style.lineHeight) / parseFloat(style.fontSize);
    if (ratio < 1.55) problems.push('tight leading ' + ratio.toFixed(2) + ': ' + text.slice(0, 24));
  }

  // 3. Headings must not carry negative tracking, which joins Arabic letters.
  for (const el of document.querySelectorAll('h1, h2, h3')) {
    const text = (el.textContent || '').trim();
    if (!text || !arabic.test(text)) continue;
    const spacing = parseFloat(getComputedStyle(el).letterSpacing);
    if (!Number.isNaN(spacing) && spacing < -0.01) {
      problems.push('negative tracking on Arabic heading: ' + text.slice(0, 24));
    }
  }

  return {
    dir: document.documentElement.dir,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    problems,
  };
`).then((result) => {
  check(`${label}: right to left`, result.dir === 'rtl', result.dir);
  check(`${label}: nothing overflows`, !result.overflows);
  check(`${label}: typography is set for Arabic`, result.problems.length === 0,
    result.problems.slice(0, 3).join(' | '));
  return result;
});

const goHome = () => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 800));
  return document.querySelector('[data-tutorial="my-medicines"]') ? 'ok' : document.body.innerText.slice(0, 120);
`);

const search = (term) => browser.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')].find(b => /\\u0627\\u0643\\u062a\\u0628/.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 120);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="detail-chips"]') || /\\u062f\\u0648\\u0627\\u0621/.test(document.querySelector('h1')?.textContent || '')) return 'ok';
  }
  return document.body.innerText.slice(0, 150);
`);

await browser.goto(BASE);
check('the camera screen is reached in Arabic', (await goHome()) === 'ok');
await audit('camera');

check('a search reaches the result screen', (await search('Lipitor')) === 'ok');
const result = await audit('result');

// The design's own numbers for the Arabic result screen.
const headline = await browser.evaluate(`
  const h1 = document.querySelector('h1');
  const style = getComputedStyle(h1);
  const eyebrow = document.querySelector('[data-tutorial="what-it-is-for"] .font-mono');
  return {
    size: style.fontSize,
    leading: (parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2),
    iconSquareHidden: (() => {
      const square = document.querySelector('.bg-night-lens');
      return !square || getComputedStyle(square).display === 'none';
    })(),
    eyebrowFace: eyebrow ? getComputedStyle(eyebrow).fontFamily : null,
    eyebrowSpacing: eyebrow ? getComputedStyle(eyebrow).letterSpacing : null,
  };
`);
check('the Arabic headline is 36px, not 40px', headline.size === '36px', headline.size);
check('and it is given the leading Arabic needs', Number(headline.leading) >= 1.3, headline.leading);
check('the icon square that pairs with the mono eyebrow is gone', headline.iconSquareHidden);
check('the section label uses the Arabic face', /Arabic/.test(headline.eyebrowFace || ''), headline.eyebrowFace);
check('and carries no letter-spacing', headline.eyebrowSpacing === 'normal', headline.eyebrowSpacing);

// Latin drug names and strengths inside Arabic must not be reordered.
const bidi = await browser.evaluate(`
  const isolated = [...document.querySelectorAll('bdi')].map(b => b.textContent.trim());
  return {
    strength: isolated.find(t => /film-coated/.test(t)),
    neverWith: isolated.find(t => /Grapefruit/.test(t)),
    count: isolated.length,
  };
`);
check('the Latin strength is kept in one piece', bidi.strength === '20 mg film-coated tablet', String(bidi.strength));
check('and so is the never-with line', /^Grapefruit juice ·/.test(bidi.neverWith || ''), String(bidi.neverWith));

await screenshot(browser, 'ar-result', import.meta.url);

// ── Side effects ───────────────────────────────────────────────────────────
check('the side effects screen opens', await browser.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 700));
  return !!document.querySelector('h2');
`));
await audit('side effects');
await screenshot(browser, 'ar-sideeffects', import.meta.url);

await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => /back|\u0639\u0648\u062f\u0629/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 700));
`);

// ── Professional ───────────────────────────────────────────────────────────
check('the clinical view opens', await browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) return true;
  }
  return false;
`));
await audit('professional');
await screenshot(browser, 'ar-professional', import.meta.url);

// ── My medicines ───────────────────────────────────────────────────────────
await browser.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 700));
  document.querySelector('[data-tutorial="save-medicine"]').click();
  await new Promise(r => setTimeout(r, 500));
  [...document.querySelectorAll('button')].find(b => /back|\u0639\u0648\u062f\u0629/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('[data-tutorial="my-medicines"]').click();
  await new Promise(r => setTimeout(r, 800));
`);
check('my medicines opens with a saved medicine', await browser.evaluate(`
  return document.querySelectorAll('[data-testid="medicine-list"] > div').length === 1;
`));
await audit('my medicines');
await screenshot(browser, 'ar-medicines', import.meta.url);

// ── Search ─────────────────────────────────────────────────────────────────
check('the search screen opens from the tab bar', await browser.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 700));
  return !!document.querySelector('input[type="search"]');
`));
await audit('search');
await screenshot(browser, 'ar-search', import.meta.url);

// ── Not a medicine ─────────────────────────────────────────────────────────
await browser.goto(BASE);
await goHome();
await browser.evaluate(`window.__patient = ${JSON.stringify(NOT_A_MEDICINE)};`);
check('a non-medicine reaches its screen', await browser.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')].find(b => /\\u0627\\u0643\\u062a\\u0628/.test(b.textContent || ''));
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'vitamin water');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (/\\u062f\\u0648\\u0627\\u0621\\u064b/.test(document.body.innerText)) return true;
  }
  return document.body.innerText.slice(0, 150);
`));
await audit('not a medicine');
await screenshot(browser, 'ar-notamedicine', import.meta.url);

// ── First run, the very first thing anybody sees ──────────────────────────
await browser.evaluate(`localStorage.removeItem('disclaimerAccepted');`);
await browser.goto(BASE);
check('the first-run screen shows', await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2500));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  return /\\u0627\\u0644\\u0645\\u0639\\u0644\\u0648\\u0645\\u0627\\u062a|\\u0645\\u0648\\u0627\\u0641\\u0642/.test(document.body.innerText) || !!document.querySelector('button');
`));
await audit('first run');
await screenshot(browser, 'ar-firstrun', import.meta.url);

await finish(browser);
