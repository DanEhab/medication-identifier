// The professional view on the emulator.
//
// Pass 1 talks to the live API, which has NOT been redeployed with the clinical
// response schema yet. Without it the model answers only the keys the prompt
// happens to name, so some rows are missing -- and that is the case worth
// proving on a device: the screen shows what there is, and never a heading with
// nothing under it. Pass 2 stubs the payload the redeployed API returns and
// checks the whole card on real Android.
import { APP_VERSION, connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

await wv.evaluate(`
  localStorage.setItem('disclaimerAcceptedVersion', '${APP_VERSION}');
    localStorage.setItem('tourSeenVersion1', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion2', '${APP_VERSION}');
  localStorage.setItem('app-language', 'en');
  return 'seeded';
`);

const reachResult = (term) => wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="professional-link"]')) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);

check('a real lookup reaches the result screen', (await reachResult('Lipitor 20mg')) === 'ok');

const clinical = await wv.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-testid="clinical-card"]')) {
      const rows = [...document.querySelectorAll('[data-testid="clinical-card"] .font-mono')].map(r => r.textContent.trim());
      const chips = [...document.querySelectorAll('[data-testid="clinical-interactions"] span')].map(s => s.textContent.trim()).filter(Boolean);
      const h1 = document.querySelector('h1');
      const text = document.body.innerText;
      return {
        reached: true,
        title: h1.textContent.trim(),
        atc: (text.match(/ATC [A-Z0-9]+/) || [null])[0],
        rows,
        chips,
        headings: [...document.querySelectorAll('h2')].map(h => h.textContent.trim()),
        noObjectText: !/\\[object Object\\]/.test(text),
        spcNote: /Verify against the current SPC/.test(text),
        overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        width: window.innerWidth,
        bodyLength: text.length,
      };
    }
    if (document.querySelector('[role="alert"]')) return { reached: false, error: document.body.innerText.slice(0, 250) };
  }
  return { reached: false, text: document.body.innerText.slice(0, 200) };
`);
check('the live clinical summary loads', clinical.reached, JSON.stringify(clinical).slice(0, 250));

if (clinical.reached) {
  console.log('   ATC:', clinical.atc, '| interactions:', JSON.stringify(clinical.chips).slice(0, 160));
  check('the generic name is the headline', Boolean(clinical.title), clinical.title);
  /*
    The labels are the parts inside a section now, not the sections themselves.

    Mechanism, contraindications, interactions, adverse effects and monitoring
    are <h2> headings above their cards; the mono labels name the values within
    — the class, the four parts of ADME, the half-life.
  */
  check('the clinical labels are filled from the live answer',
    ['CLASS', 'HALF-LIFE', 'ABSORPTION', 'METABOLISM'].every((label) => clinical.rows.includes(label)),
    JSON.stringify(clinical.rows));
  check('and the sections it groups them under are there',
    ['Pharmacokinetics', 'Adverse effects'].every((h) => (clinical.headings || []).includes(h)),
    JSON.stringify(clinical.headings));
  // Whatever the model left out simply does not appear; a label with nothing
  // under it is an empty row with a heading on it.
  const KNOWN = [
    'CLASS', 'INDICATIONS', 'HALF-LIFE', 'ABSORPTION', 'DISTRIBUTION', 'METABOLISM',
    'EXCRETION', 'AT A GLANCE', 'CHEMISTRY', 'BCS CLASS',
  ];
  check('no label is left with nothing under it',
    clinical.rows.every((row) => KNOWN.includes(row) || /^[A-Z][A-Z /-]+$/.test(row)),
    JSON.stringify(clinical.rows));
  check('nothing renders as [object Object]', clinical.noObjectText);
  check('the SPC note is there', clinical.spcNote);
  check('nothing overflows at the device width', !clinical.overflows, `${clinical.width}px`);

  // An entry cached in the old shape had to be refetched to get here at all,
  // which is the case worth proving on the real cache.
  const cached = await wv.evaluate(`
    document.querySelector('[data-testid="tab-plain"]').click();
    await new Promise(r => setTimeout(r, 800));
    const started = Date.now();
    document.querySelector('[data-tutorial="professional-link"]').click();
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (document.querySelector('[data-testid="clinical-card"]')) {
        return { ms: Date.now() - started, rows: [...document.querySelectorAll('[data-testid="clinical-card"] .font-mono')].length };
      }
    }
    return { ms: -1 };
  `);
  check('a second visit is served from the cache in the new shape',
    cached.ms > 0 && cached.rows >= 3, JSON.stringify(cached));

  const back = await wv.evaluate(`
    document.querySelector('[data-testid="tab-plain"]').click();
    await new Promise(r => setTimeout(r, 900));
    return { onResult: !!document.querySelector('[data-tutorial="quick-facts"]') };
  `);
  check('plain language returns to the patient view on device', back.onResult);
}

// ── Pass 2: the payload the redeployed API returns ────────────────────────
console.log('\n-- against the payload the new API returns --');

/*
  The payload as the API now normalises it: ADME in four parts, adverse
  effects and interactions grouped. The flat version this used to hold was the
  old schema, and against it the screen correctly renders nothing for the
  sections that no longer have anything to show.
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
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil'],
  interactions: [
    { heading: 'Increased exposure', items: ['Strong CYP3A4 inhibitors raise plasma levels; cap the dose.'] },
  ],
  adverseEffects: [
    { heading: 'Musculoskeletal', items: ['Myalgia', 'Rhabdomyolysis (rare)'] },
    { heading: 'Hepatic', items: ['Transaminase rise'] },
  ],
  monitoring: 'Lipid panel at 4-12 weeks after initiation or dose change.',
  chemistry: 'Calcium trihydrate salt.',
  bcsClass: 'II (low solubility, high permeability)',
  references: ['SmPC', 'DailyMed'],
};

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const stubbed = await wv.evaluate(`
  localStorage.setItem('disclaimerAcceptedVersion', '${APP_VERSION}');
    localStorage.setItem('tourSeenVersion1', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion2', '${APP_VERSION}');
  localStorage.setItem('app-language', 'en');
  window.__realFetch = window.__realFetch || window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('/api/generate') && /healthcare professional/.test(JSON.parse(init.body).contents)) {
      return new Response(JSON.stringify({ text: JSON.stringify(${JSON.stringify(CLINICAL)}), cached: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return window.__realFetch(input, init);
  };
  return 'stubbed';
`);
check('the clinical stub is in place', stubbed === 'stubbed', String(stubbed));
check('a real lookup reaches the result screen again', (await reachResult('Lipitor 20mg')) === 'ok');

const full = await wv.evaluate(`
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) {
      const h1 = document.querySelector('h1');
      return {
        title: h1.textContent.trim(),
        titleSize: getComputedStyle(h1).fontSize,
        rows: [...document.querySelectorAll('[data-testid="clinical-card"] .font-mono')].map(r => r.textContent.trim()),
        chips: [...document.querySelectorAll('[data-testid="clinical-interactions"] span')]
          .map(s => s.textContent.trim()).filter(Boolean),
        headings: [...document.querySelectorAll('h2')].map(h => h.textContent.trim()),
        atc: /ATC C10AA05/.test(document.body.innerText),
        overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }
  }
  return { error: document.body.innerText.slice(0, 200) };
`);
check('the generic name is the headline once the schema is deployed',
  full.title === 'Atorvastatin' && full.titleSize === '30px', `${full.title} @${full.titleSize}`);
check('the ATC code is shown', full.atc);
check('every clinical section renders on device',
  ['Mechanism of action', 'Pharmacokinetics', 'Interactions', 'Adverse effects', 'Monitoring']
    .every((heading) => (full.headings || []).includes(heading)),
  JSON.stringify(full.headings));
check('and the parts inside them are labelled',
  ['CLASS', 'HALF-LIFE', 'ABSORPTION', 'DISTRIBUTION', 'METABOLISM', 'EXCRETION']
    .every((label) => (full.rows || []).includes(label)),
  JSON.stringify(full.rows));
check('the interactions render as chips',
  (full.chips || []).includes('Ciclosporin'), JSON.stringify(full.chips));
check('nothing overflows at the device width', !full.overflows);

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
