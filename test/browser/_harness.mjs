// Shared machinery for the browser suites.
//
// Every suite needs the same four things: a phone-sized headless Chrome, the
// backend stubbed so a test never spends a Gemini call, a way to get from the
// camera to the screen under test, and a way to say what it expects. Those
// lived copied into eight files; a fixture changed in one of them and not the
// others is a test that passes for the wrong reason.

import { fileURLToPath } from 'node:url';
import { launch } from './_cdp.mjs';

export const BASE = process.env.BASE || 'http://localhost:4173';

// ── Fixtures ───────────────────────────────────────────────────────────────
//
// One medicine, described the way the deployed API describes it. Suites that
// need something else spread over these rather than writing a fresh record,
// so a field added to the schema is added here once.

export const PATIENT = {
  drugName: 'Lipitor',
  canonicalName: 'Atorvastatin calcium',
  brandName: 'Lipitor',
  strength: '20 mg film-coated tablet',
  whatItIsFor: 'Lowers bad cholesterol to cut your risk of a heart attack or stroke.',
  commonUse: 'High cholesterol.',
  howToTake: 'Swallow whole with water. If you miss a dose, skip it — never double up the next day.',
  dosageAdministration: 'One tablet daily.',
  foodDrinkEffect: 'Grapefruit juice raises the level in your blood.',
  missedDose: 'Take it when you remember, unless the next dose is within twelve hours.',
  tellYourDoctorIf: 'you get unexplained muscle pain, tenderness or weakness — especially with a fever.',
  neverWith: 'Grapefruit juice · clarithromycin · some HIV medicines',
  quickDose: '1 tablet', quickDoseNote: 'a day',
  quickTiming: 'Any time', quickTimingNote: 'same hour',
  quickFood: 'Food', quickFoodNote: 'not needed',
  commonSideEffects: ['Headache', 'Stuffy or runny nose', 'Joint or back pain'],
  seriousSideEffects: ['Muscle pain with dark urine', 'Yellowing of the eyes or skin'],
  consultDoctorWhen: ['You become pregnant'],
  storage: 'Below 25 °C, in the original pack.',
  recognition: 'medication',
};

export const CLINICAL = {
  genericName: 'Atorvastatin',
  atcCode: 'C10AA05',
  formAndStrength: 'calcium trihydrate · 20 mg f/c tab',
  drugClass: 'HMG-CoA reductase inhibitor (statin)',
  mechanism: 'Competitively inhibits HMG-CoA reductase, the rate-limiting step of hepatic cholesterol synthesis.',
  pharmacokinetics: 'Oral bioavailability ~14%. First-pass metabolism via CYP3A4. t½ 14 h. Biliary excretion.',
  contraindications: 'Active hepatic disease, pregnancy and lactation.',
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil', 'Colchicine'],
  monitoring: 'Lipid panel at 4-12 weeks after initiation or dose change.',
};

/** What the model returns for something it recognises but is not a medicine. */
export const NOT_A_MEDICINE = {
  recognition: 'substance',
  identifiedAs: 'It looks like a flavoured drink, so there is nothing here we can tell you about safely.',
  safetyNote: '',
  drugName: '', strength: '', commonUse: '', dosageAdministration: '',
  foodDrinkEffect: '', missedDose: '', storage: '',
  commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [],
};

// ── Reporting ──────────────────────────────────────────────────────────────

let failures = 0;

export const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

export const finish = async (browser) => {
  await browser.close();
  console.log(failures ? `\n${failures} failing` : '\nall green');
  process.exit(failures ? 1 : 0);
};

// ── The app, ready to be driven ────────────────────────────────────────────

/**
 * A phone-sized Chrome with first-run cleared and the backend stubbed.
 *
 * `language` seeds rather than sets: the injection runs on every navigation,
 * so writing it outright would undo a switch made mid-test.
 *
 * `suggestions` and the answers are read from window at request time, so a
 * suite can change what the backend says without reloading — but note that a
 * navigation re-runs this script and resets them, which is a mistake worth
 * making only once.
 */
export async function openApp({
  language = 'en',
  dark = false,
  storage = {},
  patient = PATIENT,
  clinical = CLINICAL,
  suggestions = [],
  /**
   * Show the disclaimer, as a new install would.
   *
   * Worth an option rather than a removeItem in the suite: this script runs on
   * every navigation, so clearing the flag from a test and then navigating put
   * it straight back. A dark-mode audit "of the first-run screen" was in fact
   * auditing the camera, and missed that the screen was white-on-white.
   */
  firstRun = false,
} = {}) {
  const browser = await launch({ width: 428, height: 908 });

  if (dark) {
    await browser.page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    });
  }

  const seeds = Object.entries(storage)
    .map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n    ');

  await browser.page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      ${firstRun ? '' : "localStorage.setItem('disclaimerAccepted', 'true');"}
      // The tour clears its own done-flags whenever the stored version differs,
      // so the version has to be seeded too or it reappears over every screen.
      localStorage.setItem('tutorial_version', '1.4.0');
      localStorage.setItem('tutorial_phase1_done', 'true');
      localStorage.setItem('tutorial_phase2_done', 'true');
      if (!localStorage.getItem('app-language')) localStorage.setItem('app-language', ${JSON.stringify(language)});
      ${seeds}

      window.__patient = ${JSON.stringify(patient)};
      window.__clinical = ${JSON.stringify(clinical)};
      window.__suggestions = ${JSON.stringify(suggestions)};
      window.__clinicalDelayMs = 0;
      window.__prompts = [];
      window.__suggestCalls = [];

      const realFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = String(input && input.url ? input.url : input);
        if (url.includes('/api/suggest')) {
          window.__suggestCalls.push(url);
          return new Response(JSON.stringify({ suggestions: window.__suggestions }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('/api/generate')) {
          const prompt = JSON.parse(init.body).contents;
          window.__prompts.push(prompt);
          const clinicalAsk = /healthcare professional/.test(prompt);
          if (clinicalAsk && window.__clinicalDelayMs) {
            await new Promise(r => setTimeout(r, window.__clinicalDelayMs));
          }
          const body = clinicalAsk ? window.__clinical : window.__patient;
          return new Response(JSON.stringify({ text: JSON.stringify(body), cached: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return realFetch(input, init);
      };
    `,
  });

  await browser.goto(BASE);
  return browser;
}

// ── Getting around ─────────────────────────────────────────────────────────
//
// Written to work in either language: an English-only selector is the single
// commonest way one of these suites breaks.

/** Past the intro clip and onto the disclaimer. */
export const reachFirstRun = (browser) => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2400));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1200));
  return document.querySelector('#firstrun-title') ? 'ok' : document.body.innerText.slice(0, 140);
`);

/** Past the intro clip and onto the camera. */
export const reachCamera = (browser) => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 800));
  return document.querySelector('[data-tutorial="my-medicines"]') ? 'ok' : document.body.innerText.slice(0, 140);
`);

/** Types a name and waits for whatever the lookup produces. */
export const searchFor = (browser, term) => browser.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')]
    .find(b => /type the name|\\u0627\\u0643\\u062a\\u0628/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 140);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  if (!input) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form && input.form.requestSubmit();
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="detail-chips"]')) return 'ok';
    if (document.querySelector('[data-testid="not-a-medicine"]')) return 'notAMedicine';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 180);
`);

/** The back control, whichever language labelled it. */
export const goBack = (browser) => browser.evaluate(`
  const back = [...document.querySelectorAll('button')]
    .find(b => /back|\\u0639\\u0648\\u062f\\u0629/i.test(b.getAttribute('aria-label') || ''));
  if (!back) return 'no back button';
  back.click();
  await new Promise(r => setTimeout(r, 800));
  return 'ok';
`);

export const openProfessional = (browser) => browser.evaluate(`
  const row = document.querySelector('[data-tutorial="professional-link"]');
  if (!row) return 'no professional row';
  row.click();
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) return 'ok';
    if (document.querySelector('[role="alert"]')) return 'error';
  }
  return 'timed out';
`);

export const openMyMedicines = (browser) => browser.evaluate(`
  const entry = document.querySelector('[data-tutorial="my-medicines"]') || document.querySelector('[data-tab="medicines"]');
  if (!entry) return 'no way in';
  entry.click();
  await new Promise(r => setTimeout(r, 900));
  return document.querySelector('[data-tab="medicines"]') ? 'ok' : document.body.innerText.slice(0, 140);
`);

/** Sets a field on window after a navigation has reset it. */
export const setBackendAnswer = (browser, key, value) =>
  browser.evaluate(`window.${key} = ${JSON.stringify(value)}; return 'set';`);

/**
 * fileURLToPath rather than URL.pathname: the repo lives under a path with a
 * space in it, and pathname hands back the percent-encoded form, which fs then
 * tries to open literally.
 */
export const screenshot = (browser, name, importUrl) =>
  browser.screenshot(fileURLToPath(new URL(`./__screens__/${name}.png`, importUrl)), { fullPage: false });
