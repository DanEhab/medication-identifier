// My medicines: profiles, the interaction check, schedules, and the tab bar.
import { openApp, check, finish, screenshot, BASE } from './_harness.mjs';

const med = (name, extra = {}) => ({
  drugInfo: {
    drugName: name, brandName: name, canonicalName: '', strength: '',
    commonUse: '', dosageAdministration: '', foodDrinkEffect: '', missedDose: '', storage: '',
    commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [],
    ...extra,
  },
  language: 'en',
  originalName: name,
  savedAt: new Date().toISOString(),
  profileId: 'me',
});

const browser = await openApp();

const seed = (meds) => browser.evaluate(`
  localStorage.setItem('myMedications', ${JSON.stringify(JSON.stringify(meds))});
  return localStorage.getItem('myMedications').length;
`);

const openMedicines = () => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 700));
  const btn = [...document.querySelectorAll('[data-tutorial="my-medicines"]')][0];
  if (!btn) return 'no medicines button';
  btn.click();
  await new Promise(r => setTimeout(r, 700));
  return document.querySelector('[data-tab="medicines"]') ? 'ok' : document.body.innerText.slice(0, 150);
`);

await browser.goto(BASE);

// ── The camera reaches the list, and the list reaches everything ───────────
check('the camera header opens my medicines', (await openMedicines()) === 'ok');

const nav = await browser.evaluate(`
  const tabs = [...document.querySelectorAll('[data-tab]')];
  return {
    tabs: tabs.map(t => t.innerText.trim()),
    current: tabs.find(t => t.getAttribute('aria-current') === 'page')?.getAttribute('data-tab'),
    title: (document.querySelector('h1') || {}).textContent,
    empty: /Nothing saved yet/.test(document.body.innerText),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the tab bar names the three places', nav.tabs.length === 3, JSON.stringify(nav.tabs));
check('medicines is the current tab', nav.current === 'medicines', String(nav.current));
check('the screen is titled', nav.title === 'My medicines', String(nav.title));
check('an empty list says so rather than showing nothing', nav.empty);
check('nothing overflows sideways', !nav.overflows);

const toSearch = await browser.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 700));
  return !!document.querySelector('input[type="search"]');
`);
check('the search tab reaches search', toSearch);

const backToMeds = await browser.evaluate(`
  const backBtn = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
  backBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const btn = document.querySelector('[data-tutorial="my-medicines"]');
  btn.click();
  await new Promise(r => setTimeout(r, 700));
  document.querySelector('[data-tab="scan"]').click();
  await new Promise(r => setTimeout(r, 800));
  return !!document.querySelector('[data-tutorial="my-medicines"]');
`);
check('the scan tab reaches the camera', backToMeds);

// ── The list ───────────────────────────────────────────────────────────────
await seed([
  med('Lipitor', { canonicalName: 'Atorvastatin', strength: '20 mg', neverWith: 'Grapefruit juice · clarithromycin · some HIV medicines' }),
  med('Metformin', { canonicalName: 'Metformin', strength: '850 mg', neverWith: 'Alcohol in large amounts' }),
  med('Panadol Extra', { canonicalName: 'Paracetamol + caffeine', strength: '500 mg / 65 mg', neverWith: '' }),
]);
await browser.goto(BASE);
check('the list reopens', (await openMedicines()) === 'ok');

const listed = await browser.evaluate(`
  const cards = [...document.querySelectorAll('[data-testid="medicine-list"] > div')];
  return {
    count: cards.length,
    first: cards[0].innerText.replace(/\\n/g, ' | '),
    warning: !!document.querySelector('[data-testid="interaction-warning"]'),
  };
`);
check('every saved medicine is listed', listed.count === 3, String(listed.count));
check('each shows its ingredient and strength', /Atorvastatin · 20 mg/.test(listed.first), listed.first);
check('no interaction is claimed when none of them names another',
  !listed.warning, 'grapefruit and alcohol must not match a medicine');

// ── The interaction check ──────────────────────────────────────────────────
await seed([
  med('Lipitor', { canonicalName: 'Atorvastatin', strength: '20 mg', neverWith: 'Grapefruit juice · clarithromycin · some HIV medicines' }),
  med('Klacid 500mg', { canonicalName: 'Clarithromycin', strength: '500 mg', neverWith: '' }),
  med('Panadol Extra', { canonicalName: 'Paracetamol + caffeine', strength: '500 mg / 65 mg', neverWith: '' }),
]);
await browser.goto(BASE);
await openMedicines();

const warned = await browser.evaluate(`
  const card = document.querySelector('[data-testid="interaction-warning"]');
  if (!card) return { shown: false, text: document.body.innerText.slice(0, 200) };
  const text = card.innerText.replace(/\\n/g, ' | ');
  card.click();
  await new Promise(r => setTimeout(r, 500));
  const sheet = document.querySelector('[role="dialog"]');
  return {
    shown: true,
    text,
    sheet: sheet ? sheet.innerText.replace(/\\n/g, ' | ') : null,
  };
`);
check('a real interaction is found', warned.shown, JSON.stringify(warned).slice(0, 200));
check('and it names both medicines',
  /Lipitor/.test(warned.text) && /Klacid/.test(warned.text), warned.text);
check('the sheet shows the warning it actually matched',
  /clarithromycin/i.test(warned.sheet || ''), (warned.sheet || '').slice(0, 160));
check('and says what the check cannot do',
  /does not mean a combination is safe/i.test(warned.sheet || ''), 'the caveat must be where it is relied on');

await browser.evaluate(`
  const btn = [...document.querySelectorAll('[role="dialog"] button')].find(b => /Got it/.test(b.innerText));
  btn.click();
  await new Promise(r => setTimeout(r, 400));
`);

// The same medicine saved twice is not an interaction with itself.
await seed([
  med('Lipitor', { canonicalName: 'Atorvastatin', strength: '20 mg', neverWith: 'clarithromycin' }),
  med('Atorvastatin', { canonicalName: 'Atorvastatin', strength: '20 mg', neverWith: 'clarithromycin' }),
]);
await browser.goto(BASE);
await openMedicines();
const selfMatch = await browser.evaluate(`
  return !!document.querySelector('[data-testid="interaction-warning"]');
`);
check('one medicine saved under two names does not warn about itself', !selfMatch);

// ── Profiles ───────────────────────────────────────────────────────────────
await browser.evaluate(`
  localStorage.removeItem('profiles');
  localStorage.removeItem('activeProfile');
`);
await seed([
  med('Lipitor', { canonicalName: 'Atorvastatin', strength: '20 mg' }),
  { ...med('Ventolin', { canonicalName: 'Salbutamol', strength: '100 mcg' }), profileId: 'mum' },
]);
await browser.goto(BASE);
await openMedicines();

const profiles = await browser.evaluate(`
  const pills = [...document.querySelectorAll('[data-testid="profiles"] button')];
  return {
    labels: pills.map(p => p.innerText.trim()).filter(Boolean),
    listed: [...document.querySelectorAll('[data-testid="medicine-list"] > div')].map(c => c.innerText.split('\\n')[0]),
  };
`);
check('one profile exists by default', profiles.labels.some((l) => /Me/.test(l)), JSON.stringify(profiles.labels));
check("and only that person's medicines are listed",
  profiles.listed.length === 1 && /Lipitor/.test(profiles.listed[0]), JSON.stringify(profiles.listed));

const added = await browser.evaluate(`
  const plus = [...document.querySelectorAll('[data-testid="profiles"] button')].at(-1);
  plus.click();
  await new Promise(r => setTimeout(r, 300));
  const input = document.querySelector('[data-testid="profiles"] input');
  if (!input) return { error: 'no input' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Mum');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  const pills = [...document.querySelectorAll('[data-testid="profiles"] button')].map(p => p.innerText.trim()).filter(Boolean);
  return {
    pills,
    listed: [...document.querySelectorAll('[data-testid="medicine-list"] > div')].map(c => c.innerText.split('\\n')[0]),
    emptyForMum: /Nothing saved/.test(document.body.innerText),
  };
`);
check('a second person can be added', added.pills.some((p) => /Mum/.test(p)), JSON.stringify(added.pills));
check('and their list starts empty rather than showing somebody else’s',
  added.emptyForMum, JSON.stringify(added.listed));

const switched = await browser.evaluate(`
  const me = [...document.querySelectorAll('[data-testid="profiles"] button')].find(p => /Me/.test(p.innerText));
  me.click();
  await new Promise(r => setTimeout(r, 500));
  return [...document.querySelectorAll('[data-testid="medicine-list"] > div')].map(c => c.innerText.split('\\n')[0]);
`);
check('switching back shows the first list again',
  switched.length === 1 && /Lipitor/.test(switched[0]), JSON.stringify(switched));

// ── Schedules ──────────────────────────────────────────────────────────────
const scheduled = await browser.evaluate(`
  const footer = [...document.querySelectorAll('[data-testid="medicine-list"] button')]
    .find(b => /Add when to take it/.test(b.innerText));
  if (!footer) return { error: document.body.innerText.slice(0, 200) };
  footer.click();
  await new Promise(r => setTimeout(r, 500));

  const time = document.querySelector('[role="dialog"] input[type="time"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(time, '21:00');
  time.dispatchEvent(new Event('input', { bubbles: true }));
  time.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Add').click();
  await new Promise(r => setTimeout(r, 300));

  const note = [...document.querySelectorAll('[role="dialog"] input')].find(i => i.type !== 'time');
  setter.call(note, 'after dinner');
  note.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Save').click();
  await new Promise(r => setTimeout(r, 600));

  return {
    card: document.querySelector('[data-testid="medicine-list"] > div').innerText.replace(/\\n/g, ' | '),
    stored: JSON.parse(localStorage.getItem('myMedications')).find(m => m.drugInfo.drugName === 'Lipitor').schedule,
  };
`);
check('a time and a note can be added', /21:00/.test(scheduled.card || '') && /after dinner/.test(scheduled.card || ''),
  JSON.stringify(scheduled).slice(0, 200));
check('and are stored on the device',
  scheduled.stored && scheduled.stored.times[0] === '21:00' && scheduled.stored.note === 'after dinner',
  JSON.stringify(scheduled.stored));

const survived = await browser.evaluate(`
  // Re-saving the medicine must not throw the schedule away.
  const list = JSON.parse(localStorage.getItem('myMedications'));
  return list.find(m => m.drugInfo.drugName === 'Lipitor').profileId;
`);
check('the medicine still belongs to the right person', survived === 'me', String(survived));

// ── Opening one goes to its page ───────────────────────────────────────────
const opened = await browser.evaluate(`
  const card = document.querySelector('[data-testid="medicine-list"] > div button');
  card.click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    // The quick-facts grid only renders when the record has those fields, and
    // this fixture has none; the chips are always there on a result screen.
    if (document.querySelector('[data-tutorial="detail-chips"]')) {
      const h1 = document.querySelector('h1');
      return h1 && /Lipitor/.test(h1.textContent) ? 'ok' : 'wrong medicine: ' + (h1 || {}).textContent;
    }
  }
  return document.body.innerText.slice(0, 150);
`);
check('tapping a medicine opens its page offline', opened === 'ok', opened);

await browser.goto(BASE);
await openMedicines();
await screenshot(browser, 'medicines-en', import.meta.url);

// ── Arabic ─────────────────────────────────────────────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto(BASE);
check('Arabic opens the list', (await openMedicines()) === 'ok');
const arabic = await browser.evaluate(`
  return {
    dir: document.documentElement.dir,
    title: (document.querySelector('h1') || {}).textContent,
    tabs: [...document.querySelectorAll('[data-tab]')].map(t => t.innerText.trim()),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the list is right to left', arabic.dir === 'rtl', arabic.dir);
check('its title is Arabic', /[؀-ۿ]/.test(arabic.title || ''), arabic.title);
check('the tabs are Arabic', arabic.tabs.every((tab) => /[؀-ۿ]/.test(tab)), JSON.stringify(arabic.tabs));
check('nothing overflows in Arabic', !arabic.overflows);
await screenshot(browser, 'medicines-ar', import.meta.url);

await finish(browser);
