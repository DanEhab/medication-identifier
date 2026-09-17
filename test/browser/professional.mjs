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

/*
  The clinical answer, in the shape the screen renders.

  It used to be flat prose per heading, which is what the screen had room for:
  ADME was one sentence and the adverse effects were absent entirely. An
  earlier build of this app showed both in full, and this is the merge — the
  new view's ATC code, contraindications and monitoring, with the old one's
  four-part kinetics, grouped effects and grouped interactions.
*/
const CLINICAL = {
  genericName: 'Atorvastatin',
  atcCode: 'C10AA05',
  formAndStrength: 'calcium trihydrate · 20 mg f/c tab',
  drugClass: 'HMG-CoA reductase inhibitor (statin)',
  indications: 'Primary hypercholesterolaemia; secondary prevention of cardiovascular events.',
  mechanism: 'Competitively inhibits HMG-CoA reductase, the rate-limiting step of hepatic cholesterol synthesis.',
  pharmacokinetics: {
    absorption: 'Oral bioavailability ~14% after extensive first-pass extraction.',
    distribution: 'Highly protein-bound (>98%); Vd 381 L.',
    metabolism: 'Hepatic, via CYP3A4, to active hydroxylated metabolites.',
    excretion: 'Biliary; renal clearance is negligible.',
    halfLife: '14 h',
  },
  contraindications: ['Active hepatic disease', 'Pregnancy and lactation'],
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil', 'Colchicine'],
  interactions: [
    { group: 'Increased exposure', detail: 'Strong CYP3A4 inhibitors raise plasma levels; cap the dose.' },
  ],
  adverseEffects: [
    { system: 'Musculoskeletal', effects: ['Myalgia', 'Rhabdomyolysis (rare)'] },
    { system: 'Hepatic', effects: ['Transaminase rise'] },
  ],
  monitoring: 'Lipid panel at 4-12 weeks after initiation or dose change.',
  chemistry: 'Calcium trihydrate salt.',
  bcsClass: 'II (low solubility, high permeability)',
  references: ['SmPC', 'DailyMed'],
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
  const chips = [...document.querySelectorAll('[data-testid="clinical-interactions"] span')].map(s => s.textContent.trim());
  return {
    title: h1.textContent.trim(),
    titleSize: getComputedStyle(h1).fontSize,
    atc: /ATC C10AA05/.test(text),
    form: /calcium trihydrate · 20 mg f\\/c tab/.test(text),
    rows,
    chips,
    text,
    headings: [...document.querySelectorAll('h2')].map(h => h.textContent.trim()),
    headingSize: parseFloat(getComputedStyle(document.querySelector('h2')).fontSize),
    labelSize: parseFloat(getComputedStyle(document.querySelector('[data-testid="clinical-card"] .font-mono')).fontSize),
    mechanism: /rate-limiting step of hepatic cholesterol synthesis/.test(text),
    kinetics: /Oral bioavailability ~14%/.test(text),
    indications: /secondary prevention of cardiovascular events/.test(text),
    references: /SmPC/.test(text),
    monitoring: /Lipid panel at 4-12 weeks/.test(text),
    spcNote: /Verify against the current SPC before prescribing/.test(text),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the generic name is the headline', screen.title === 'Atorvastatin' && screen.titleSize === '30px',
  `${screen.title} @${screen.titleSize}`);
check('the ATC code sits above it', screen.atc);
check('the salt and presentation sit below it', screen.form);
/*
  The page has section headings above its labels now.

  It used to be one card of eight mono labels over eight paragraphs, so the
  parts that have parts — ADME, adverse effects by system, interactions by
  mechanism — had nowhere to go and arrived flattened into a sentence each.
*/
check('every section the design calls for is present',
  ['Mechanism of action', 'Pharmacokinetics', 'Contraindications', 'Interactions',
    'Adverse effects', 'Monitoring']
    .every((heading) => screen.headings.includes(heading)),
  JSON.stringify(screen.headings));
check('and the labels inside them name the parts',
  ['CLASS', 'INDICATIONS', 'HALF-LIFE', 'ABSORPTION', 'DISTRIBUTION', 'METABOLISM', 'EXCRETION']
    .every((label) => screen.rows.includes(label)),
  JSON.stringify(screen.rows));
check('a heading is larger than the labels under it',
  screen.headingSize > screen.labelSize, `${screen.headingSize} vs ${screen.labelSize}`);
check('the adverse effects keep the system they belong to',
  screen.rows.includes('MUSCULOSKELETAL') && /Rhabdomyolysis/.test(screen.text),
  JSON.stringify(screen.rows));
check('and the interactions keep the mechanism they are grouped under',
  screen.rows.includes('INCREASED EXPOSURE') && /cap the dose/.test(screen.text),
  JSON.stringify(screen.rows));
check('the four parts of the kinetics are separate',
  /Vd 381 L/.test(screen.text) && /renal clearance is negligible/.test(screen.text),
  screen.text.slice(0, 120));
check('the interactions are chips, not a sentence',
  screen.chips.includes('Strong CYP3A4 inhibitors') && screen.chips.includes('Gemfibrozil'),
  JSON.stringify(screen.chips));
check('mechanism, kinetics and monitoring all render',
  screen.mechanism && screen.kinetics && screen.monitoring,
  JSON.stringify({ m: screen.mechanism, k: screen.kinetics, mo: screen.monitoring }));
check('what it is licensed for is there, which it never used to be', screen.indications);
check('and the sources to check it against', screen.references);
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
        kept: /Rapid, peak at 1-2 h/.test(text) && /CYP3A4/.test(text),
        noObjectText: !/\\[object Object\\]/.test(text),
        chip: [...document.querySelectorAll('[data-testid="clinical-interactions"] span')]
          .map(s => s.textContent.trim()).filter(Boolean),
      };
    }
  }
  return { error: document.body.innerText.slice(0, 200) };
`);
// Kept as parts rather than flattened: the screen has a subheading for each.
check('a nested kinetics object keeps its parts', nested.kept, JSON.stringify(nested));
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

// Back to English for the checks that follow, which read English labels.
await browser.evaluate(`localStorage.setItem('app-language', 'en');`);
await browser.goto(BASE);
await reachResult();

/*
  ── A half-life that is a sentence is not set as a figure ─────────────────

  The schema asks for a bare figure because the screen sets it large: it is the
  number looked for first. Levothyroxine's came back from the live model as two
  sentences about steady state, and a hundred and fifty characters at nineteen
  pixels swamps the card it is meant to lead.
*/
await browser.evaluate(`
  window.__clinicalDelayMs = 0;
  window.__clinical = {
    ...window.__clinical,
    pharmacokinetics: {
      ...window.__clinical.pharmacokinetics,
      halfLife: 'The elimination half-life is approximately 6-7 days in euthyroid individuals. Steady state is typically reached within 4-6 weeks of consistent dosing.',
    },
  };
`);
const longHalfLife = await browser.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const pk = document.querySelector('[data-testid="clinical-pk"]');
    if (pk) {
      await new Promise(r => setTimeout(r, 300));
      const sizes = [...pk.querySelectorAll('span, p')]
        .filter(el => /euthyroid/.test(el.textContent || ''))
        .map(el => parseFloat(getComputedStyle(el).fontSize));
      return { shown: /euthyroid/.test(pk.innerText), sizes };
    }
  }
  return { error: document.body.innerText.slice(0, 160) };
`);
check('a sentence-length half-life is still shown', longHalfLife.shown, JSON.stringify(longHalfLife));
check('but set as a passage rather than as a figure',
  longHalfLife.sizes.length > 0 && longHalfLife.sizes.every((size) => size <= 17),
  JSON.stringify(longHalfLife.sizes));

await finish(browser);
