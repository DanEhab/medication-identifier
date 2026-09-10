// The professional view: the same drug, for clinicians.
import { openApp, check, finish, screenshot, BASE } from './_harness.mjs';

const PATIENT = {
  drugName: 'Lipitor', canonicalName: 'Atorvastatin calcium', brandName: 'Lipitor',
  strength: '20 mg', whatItIsFor: 'Lowers bad cholesterol.', commonUse: 'x',
  howToTake: 'Swallow.', dosageAdministration: 'One daily.', foodDrinkEffect: 'x',
  missedDose: 'y', tellYourDoctorIf: 'muscle pain.', neverWith: 'Grapefruit',
  quickDose: '1 tablet', quickDoseNote: 'a day', quickTiming: 'Any time',
  quickTimingNote: 'same hour', quickFood: 'Food', quickFoodNote: 'not needed',
  commonSideEffects: ['Headache'], seriousSideEffects: ['Rhabdo'],
  consultDoctorWhen: ['Dark urine'], storage: 'Cool', recognition: 'medication',
};

const CLINICAL = {
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

const browser = await openApp({ patient: PATIENT, clinical: CLINICAL });

const reachResult = () => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 700));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name|\\u0627\\u0643\\u062a\\u0628/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button';
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Lipitor');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="professional-link"]')) return 'ok';
  }
  return document.body.innerText.slice(0, 200);
`);

const openProfessional = () => browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) return 'ok';
  }
  return document.body.innerText.slice(0, 200);
`);

await browser.goto(BASE);
check('the result screen is reached', (await reachResult()) === 'ok');
check('the professional row opens the clinical view', (await openProfessional()) === 'ok');

// ── The screen ─────────────────────────────────────────────────────────────
const screen = await browser.evaluate(`
  const text = document.body.innerText;
  const h1 = document.querySelector('h1');
  const rows = [...document.querySelectorAll('[data-testid="clinical-card"] .font-mono')].map(r => r.textContent.trim());
  const chips = [...document.querySelectorAll('[data-testid="clinical-card"] span')].map(s => s.textContent.trim());
  return {
    title: h1.textContent.trim(),
    titleSize: getComputedStyle(h1).fontSize,
    atc: /ATC C10AA05/.test(text),
    form: /calcium trihydrate · 20 mg f\\/c tab/.test(text),
    rows,
    chips,
    mechanism: /rate-limiting step of hepatic cholesterol synthesis/.test(text),
    kinetics: /Oral bioavailability ~14%/.test(text),
    monitoring: /Lipid panel at 4-12 weeks/.test(text),
    spcNote: /Verify against the current SPC before prescribing/.test(text),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the generic name is the headline', screen.title === 'Atorvastatin' && screen.titleSize === '30px',
  `${screen.title} @${screen.titleSize}`);
check('the ATC code sits above it', screen.atc);
check('the salt and presentation sit below it', screen.form);
check('every clinical row from the design is present',
  ['CLASS', 'MECHANISM', 'PHARMACOKINETICS', 'CONTRAINDICATIONS', 'MAJOR INTERACTIONS', 'MONITORING']
    .every((label) => screen.rows.includes(label)),
  JSON.stringify(screen.rows));
check('the interactions are chips, not a sentence',
  screen.chips.includes('Strong CYP3A4 inhibitors') && screen.chips.includes('Gemfibrozil'),
  JSON.stringify(screen.chips));
check('mechanism, kinetics and monitoring all render',
  screen.mechanism && screen.kinetics && screen.monitoring,
  JSON.stringify({ m: screen.mechanism, k: screen.kinetics, mo: screen.monitoring }));
check('it says to verify against the SPC', screen.spcNote);
check('nothing overflows sideways', !screen.overflows);

await screenshot(browser, 'professional-en', import.meta.url);

// ── The segmented control ──────────────────────────────────────────────────
const segmented = await browser.evaluate(`
  const plain = document.querySelector('[data-testid="tab-plain"]');
  const pro = document.querySelector('[data-testid="tab-professional"]');
  return {
    labels: [plain.textContent.trim(), pro.textContent.trim()],
    proSelected: pro.getAttribute('aria-selected') === 'true',
    plainSelected: plain.getAttribute('aria-selected') === 'true',
    proBg: getComputedStyle(pro).backgroundColor,
  };
`);
check('both registers are named', segmented.labels.join(' / ') === 'Plain language / Professional',
  JSON.stringify(segmented.labels));
check('professional is the selected one', segmented.proSelected && !segmented.plainSelected);
check('and it is filled with the ink colour', segmented.proBg === 'rgb(11, 43, 46)', segmented.proBg);

const backToPlain = await browser.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 700));
  return {
    onResult: !!document.querySelector('[data-tutorial="quick-facts"]'),
    brand: (document.querySelector('h1') || {}).textContent,
  };
`);
check('plain language returns to the patient view', backToPlain.onResult, JSON.stringify(backToPlain));
check('and it is the same medicine', backToPlain.brand === 'Lipitor', String(backToPlain.brand));

// ── A nested object from the model must not reach the screen ──────────────
await browser.evaluate(`
  window.__clinical = {
    ...window.__clinical,
    pharmacokinetics: { absorption: 'Rapid, peak at 1-2 h.', metabolism: 'CYP3A4.', excretion: 'Biliary.' },
    majorInteractions: 'Ciclosporin',
  };
`);
const nested = await browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) {
      const text = document.body.innerText;
      return {
        flattened: /Absorption: Rapid/.test(text) && /Metabolism: CYP3A4/.test(text),
        noObjectText: !/\\[object Object\\]/.test(text),
        chip: [...document.querySelectorAll('[data-testid="clinical-card"] span')].map(s => s.textContent.trim()),
      };
    }
  }
  return { error: document.body.innerText.slice(0, 200) };
`);
check('a nested kinetics object is flattened with its labels kept', nested.flattened, JSON.stringify(nested));
check('and nothing renders as [object Object]', nested.noObjectText);
check('one interaction given as a string still becomes a chip',
  (nested.chip || []).includes('Ciclosporin'), JSON.stringify(nested.chip));

// ── The wait, and a failure ───────────────────────────────────────────────
await browser.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 600));
  window.__clinicalDelayMs = 1500;
`);
const waiting = await browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    skeleton: !!document.querySelector('[aria-hidden="true"] .bg-paper-deep'),
    // The name and the tabs are there while the body is still loading.
    named: /Lipitor|Atorvastatin/.test(document.body.innerText),
    tabs: !!document.querySelector('[data-testid="tab-plain"]'),
  };
`);
check('the wait shows the shape of the card rather than a bare spinner', waiting.skeleton, JSON.stringify(waiting));
check('and the screen is already named and navigable while it loads', waiting.named && waiting.tabs);

await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2000));
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 600));
  window.__clinicalDelayMs = 0;
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('/api/generate') && /healthcare professional/.test(JSON.parse(init.body).contents)) {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };
`);
const failed = await browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[role="alert"]')) {
      return {
        shown: true,
        stillNavigable: !!document.querySelector('[data-testid="tab-plain"]'),
        noEmptyCard: !document.querySelector('[data-testid="clinical-card"]'),
      };
    }
  }
  return { shown: false, text: document.body.innerText.slice(0, 200) };
`);
check('a failed clinical lookup says so', failed.shown, JSON.stringify(failed));
check('and leaves the way back to the patient view', failed.stillNavigable);
check('and shows no empty card of headings', failed.noEmptyCard);

// ── Arabic ────────────────────────────────────────────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto(BASE);
check('Arabic reaches the result screen', (await reachResult()) === 'ok');
check('Arabic opens the clinical view', (await openProfessional()) === 'ok');
const arabic = await browser.evaluate(`
  const rows = [...document.querySelectorAll('[data-testid="clinical-card"] .font-mono')].map(r => r.textContent.trim());
  return {
    dir: document.documentElement.dir,
    rows,
    tabs: [document.querySelector('[data-testid="tab-plain"]').textContent.trim(),
           document.querySelector('[data-testid="tab-professional"]').textContent.trim()],
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the clinical view is right to left', arabic.dir === 'rtl', arabic.dir);
check('its row labels are Arabic', arabic.rows.some((row) => /[؀-ۿ]/.test(row)), JSON.stringify(arabic.rows));
check('its tabs are Arabic', arabic.tabs.every((tab) => /[؀-ۿ]/.test(tab)), JSON.stringify(arabic.tabs));
check('nothing overflows in Arabic', !arabic.overflows);
await screenshot(browser, 'professional-ar', import.meta.url);

await finish(browser);
