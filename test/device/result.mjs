// The result screen on the emulator.
//
// Two passes. The first talks to the live API, now redeployed with the new
// fields, so it proves the whole chain end to end: schema, cache, and screen.
// The second stubs a known payload so the layout can be measured against the
// design without depending on what the model says today.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const ANSWER = {
  drugName: 'Lipitor',
  canonicalName: 'Atorvastatin calcium',
  brandName: 'Lipitor',
  strength: '20 mg film-coated tablet',
  whatItIsFor: 'Lowers bad cholesterol to cut your risk of a heart attack or stroke.',
  commonUse: 'High cholesterol.',
  howToTake: 'Swallow whole with water. If you miss a dose, skip it — never double up the next day.',
  dosageAdministration: 'One tablet daily.',
  foodDrinkEffect: 'Avoid grapefruit juice.',
  missedDose: 'Skip it and take the next one at the usual time.',
  tellYourDoctorIf: 'you get unexplained muscle pain, tenderness or weakness — especially with a fever.',
  neverWith: 'Grapefruit juice · clarithromycin · some HIV medicines',
  quickDose: '1 tablet', quickDoseNote: 'a day',
  quickTiming: 'Any time', quickTimingNote: 'same hour',
  quickFood: 'Food', quickFoodNote: 'not needed',
  commonSideEffects: ['Headache', 'Muscle aches'],
  seriousSideEffects: ['Severe muscle breakdown'],
  consultDoctorWhen: ['Dark urine'],
  storage: 'Store below 25°C, away from damp.',
  recognition: 'medication',
};

const wv = await connectWebView();

const reset = async () => {
  await wv.evaluate(`
    localStorage.setItem('disclaimerAccepted', 'true');
    localStorage.setItem('tutorial_version', '1.3.0');
    localStorage.setItem('tutorial_phase1_done', 'true');
    localStorage.setItem('tutorial_phase2_done', 'true');
    localStorage.setItem('app-language', 'en');
    localStorage.removeItem('myMedications');
    location.reload();
  `).catch(() => {});
  await new Promise((r) => setTimeout(r, 6000));
};

const search = (name) => wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"], input[type="text"]');
  if (!input) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(name)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form && input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="detail-chips"]')) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);

// ── Pass 1: the live API, now redeployed with the new fields ─────────────
console.log('\n— against the live API —');
await reset();
const liveReached = await search('Lipitor 20mg');
check('a real lookup still reaches the result screen', liveReached === 'ok', liveReached);

if (liveReached === 'ok') {
  const live = await wv.evaluate(`
    const text = document.body.innerText;
    // A section heading with nothing under it is the failure mode this guards
    // against. The ingredient name is a label, not a heading, so it is not one.
    const SECTIONS = ['WHAT IT IS FOR', 'HOW TO TAKE IT'];
    const emptyHeadings = [...document.querySelectorAll('.font-mono')]
      .filter(h => SECTIONS.includes(h.innerText.trim()))
      .filter(h => {
        const body = h.parentElement.innerText.replace(h.innerText, '').trim();
        return body.length === 0;
      })
      .map(h => h.innerText.trim());
    return {
      brand: document.querySelector('h1').textContent.trim(),
      newFieldsPresent: /WHAT IT IS FOR/.test(text),
      purpose: (() => {
        const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
        return wash ? wash.innerText.split('\\n').slice(1).join(' ').trim() : null;
      })(),
      facts: document.querySelectorAll('[data-tutorial="quick-facts"] > div').length,
      emptyHeadings,
      hasBody: text.length > 300,
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  check('the redeployed API returns the new fields', live.newFieldsPresent, live.brand);
  check('and a real purpose sentence with it', live.purpose && live.purpose.length > 20, live.purpose);
  check('and the three quick facts', live.facts === 3, String(live.facts));
  check('and the screen shows no heading with nothing under it', live.emptyHeadings.length === 0, JSON.stringify(live.emptyHeadings));
  check('the page still has real content', live.hasBody);
  check('nothing overflows', !live.overflows);
}

// ── Pass 2: the payload the redeployed API will return ────────────────────
// A full reset first: sharing storage between the two passes meant the entry
// saved here was compared against the name left over from pass 1.
console.log('\n-- against the payload the new API returns --');
await reset();

const stubReached = await wv.evaluate(`
  window.__realFetch = window.__realFetch || window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('/api/generate')) {
      return new Response(JSON.stringify({
        text: JSON.stringify(${JSON.stringify(ANSWER)}), cached: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return window.__realFetch(input, init);
  };
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"], input[type="text"]');
  if (!input) return 'no input: ' + document.body.innerText.slice(0, 150);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Lipitor');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form && input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 400));
    if (/WHAT IT IS FOR/.test(document.body.innerText)) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);
check('the new payload reaches the result screen', stubReached === 'ok', stubReached);

if (stubReached === 'ok') {
  const shown = await wv.evaluate(`
    const text = document.body.innerText;
    const h1 = document.querySelector('h1');
    const facts = [...document.querySelectorAll('[data-tutorial="quick-facts"] > div')];
    const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
    return {
      brand: h1.textContent.trim(),
      brandSize: getComputedStyle(h1).fontSize,
      washBg: getComputedStyle(wash).backgroundColor,
      facts: facts.map(f => f.innerText.replace(/\\n/g, ' ')),
      hasPurpose: /Lowers bad cholesterol/.test(text),
      hasHowTo: /Swallow whole with water/.test(text),
      hasDoctor: /unexplained muscle pain/.test(text),
      hasNever: /Grapefruit juice/.test(text),
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      width: window.innerWidth,
      dpr: window.devicePixelRatio,
    };
  `);
  check('the brand is the 40px headline', shown.brand === 'Lipitor' && shown.brandSize === '40px', `${shown.brand} @${shown.brandSize}`);
  check('the purpose sits in the teal wash', shown.hasPurpose && shown.washBg === 'rgb(228, 241, 237)', shown.washBg);
  check('three quick facts', shown.facts.length === 3, JSON.stringify(shown.facts));
  check('how to take it, both warnings', shown.hasHowTo && shown.hasDoctor && shown.hasNever,
    `howTo=${shown.hasHowTo} doctor=${shown.hasDoctor} never=${shown.hasNever}`);
  check('nothing overflows at the device width', !shown.overflows, `${shown.width}px @${shown.dpr}`);

  const sticky = await wv.evaluate(`
    // Wait for the scroll to settle rather than guessing at a delay: an
    // emulator can take longer than a fixed wait, and measuring mid-scroll
    // reports the last card as buried when it is simply still on its way up.
    window.scrollTo(0, document.body.scrollHeight);
    let previous = -1;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      const now = Math.round(window.scrollY);
      if (now === previous) break;
      previous = now;
    }
    const bar = document.querySelector('[data-tutorial="save-medicine"]').closest('div');
    const pro = document.querySelector('[data-tutorial="professional-link"]');
    const barTop = bar.getBoundingClientRect().top;
    const proBottom = pro.getBoundingClientRect().bottom;
    return {
      clear: proBottom <= barTop + 1,
      gap: Math.round(barTop - proBottom),
      scrollY: Math.round(window.scrollY),
      maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    };
  `);
  check('the sticky bar never covers the last card', sticky.clear, JSON.stringify(sticky));

  // The chips open the side effects screen now rather than expanding in place.
  const chip = await wv.evaluate(`
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
    document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
    await new Promise(r => setTimeout(r, 700));
    const text = document.body.innerText;
    const onDetails = {
      heading: (document.querySelector('h2') || {}).textContent,
      common: /COMMON/.test(text) && /Headache/.test(text),
      serious: /STOP AND GET HELP TODAY/.test(text) && /muscle breakdown/i.test(text),
      missed: /IF YOU MISS A DOSE/.test(text),
      storage: /STORAGE/.test(text),
      share: /Still unsure/.test(text),
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
    const backBtn = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
    backBtn.click();
    await new Promise(r => setTimeout(r, 600));
    onDetails.backToResult = !!document.querySelector('[data-tutorial="quick-facts"]');
    return onDetails;
  `);
  check('a chip opens the side effects screen on device',
    chip.common && chip.serious && chip.missed && chip.storage && chip.share,
    JSON.stringify(chip));
  check('the urgent list is told apart from the mild one', chip.serious, chip.heading);
  check('the side effects screen does not overflow on device', !chip.overflows);
  check('back returns to the result screen', chip.backToResult);

  const saved = await wv.evaluate(`
    const btn = document.querySelector('[data-tutorial="save-medicine"]');
    btn.click();
    await new Promise(r => setTimeout(r, 500));
    const list = JSON.parse(localStorage.getItem('myMedications') || '[]');
    return { label: btn.innerText.trim(), names: list.map(m => m.drugInfo.drugName) };
  `);
  check('saving writes the medicine on screen to the device',
    /Saved/i.test(saved.label) && saved.names.length === 1 && saved.names[0] === 'Lipitor',
    JSON.stringify(saved));
}

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
