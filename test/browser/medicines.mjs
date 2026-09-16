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

/*
  Round the three tabs and back, using nothing but the bar.

  It used to need the search screen's back arrow to get out of search. That
  arrow is gone: the bar is on all three screens now, so every one of them can
  be left the same way, and this walk is the check that says so.
*/
const roundTrip = await browser.evaluate(`
  const go = async (tab) => {
    document.querySelector('[data-tab="' + tab + '"]').click();
    await new Promise(r => setTimeout(r, 750));
  };
  const where = () => {
    const current = document.querySelector('[data-tab][aria-current="page"]');
    return current ? current.getAttribute('data-tab') : 'none';
  };
  const visited = [];
  await go('medicines'); visited.push(where());
  await go('scan'); visited.push(where());
  await go('search'); visited.push(where());
  await go('scan'); visited.push(where());
  return { visited, onCamera: !!document.querySelector('[data-tutorial="shutter"]') };
`);
check('every tab is reachable from every other one',
  JSON.stringify(roundTrip.visited) === JSON.stringify(['medicines', 'scan', 'search', 'scan']),
  JSON.stringify(roundTrip.visited));
check('the scan tab reaches the camera', roundTrip.onCamera);

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

// The selected pill is ink with a teal initial, and the tokens for the two
// are separate: pointing the initial at the pill's own foreground once turned
// it into a white disc, which no assertion here noticed.
const pillColours = await browser.evaluate(`
  // The pill is the row, not the button inside it: the name and the remove
  // control are two buttons now, and the ground they share belongs to neither.
  const pill = document.querySelector('[data-testid="profiles"] > div');
  const avatar = pill.querySelector('span');
  return {
    pill: getComputedStyle(pill).backgroundColor,
    avatarBg: getComputedStyle(avatar).backgroundColor,
    avatarFg: getComputedStyle(avatar).color,
  };
`);
check('the selected pill is ink with a teal initial',
  pillColours.pill === 'rgb(11, 43, 46)' &&
  pillColours.avatarBg === 'rgb(127, 189, 180)' &&
  pillColours.avatarFg === 'rgb(11, 43, 46)',
  JSON.stringify(pillColours));
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

// ── What a phone will hold ─────────────────────────────────────────────────
//
// Adding somebody used to return the unchanged list for every refusal, which
// the screen could not tell apart from success: the field closed, nothing
// appeared, and no reason was given.
const addPerson = (name) => browser.evaluate(`
  // Named, not "the button with an aria-label": the remove control has one
  // too, and it comes first in the row, so clicking it opened the delete
  // confirmation instead of the name field.
  const plus = document.querySelector('[data-testid="add-profile"]');
  if (plus) { plus.click(); await new Promise(r => setTimeout(r, 250)); }
  const input = document.querySelector('[data-testid="new-profile-name"]');
  if (!input) return { error: 'no field', full: true };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify('')} + ${JSON.stringify(name)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  const warning = document.querySelector('[data-testid="profile-error"]');
  return {
    warning: warning ? warning.textContent.trim() : null,
    typed: (document.querySelector('[data-testid="new-profile-name"]') || {}).value ?? null,
    names: JSON.parse(localStorage.getItem('profiles') || '[]').map(p => p.name),
    plusShown: !!document.querySelector('[data-testid="add-profile"]'),
  };
`);

await browser.evaluate(`
  localStorage.setItem('profiles', JSON.stringify([{ id: 'me', name: 'Me' }]));
  localStorage.setItem('activeProfile', 'me');
  return 'reset';
`);
await browser.goto(BASE);
await openMedicines();

const hana = await addPerson('Hana');
check('a person can be added', hana.names.includes('Hana'), JSON.stringify(hana.names));

const duplicate = await addPerson('hana');
check('the same name in a different case is refused',
  duplicate.names.filter((n) => /hana/i.test(n)).length === 1, JSON.stringify(duplicate.names));
check('and the screen says why, on screen rather than silently',
  /already have someone called/i.test(duplicate.warning || ''), String(duplicate.warning));
// Closing the field on a refusal is what made it look like it had worked.
check('and what was typed is still there to be corrected',
  duplicate.typed === 'hana', String(duplicate.typed));

const renamed = await addPerson('Hana2');
check('a name that is genuinely different is accepted',
  renamed.names.includes('Hana2'), JSON.stringify(renamed.names));

const longName = await addPerson('Abdelrahman Mohamed Salah Eldin Ibrahim');
check('a very long name is cut to something a pill can show',
  longName.names.some((n) => n.length === 24), JSON.stringify(longName.names.map((n) => n.length)));

// Fill the phone. The default person counts, so ten means eight more.
let last = longName;
for (let i = 0; last.names.length < 10 && i < 12; i++) {
  last = await addPerson(`Person ${i}`);
}
check('the phone fills up at ten people', last.names.length === 10, String(last.names.length));
check('and the way to add another is no longer offered', !last.plusShown);

const overflow = await browser.evaluate(`
  // Nothing to press, so ask the store directly: the limit must hold even if
  // the button is ever shown when it should not be.
  localStorage.setItem('profiles', JSON.stringify([
    ...JSON.parse(localStorage.getItem('profiles')),
  ]));
  return JSON.parse(localStorage.getItem('profiles')).length;
`);
check('and the stored list is exactly at the limit', overflow === 10, String(overflow));

// ── Removing a person ──────────────────────────────────────────────────────
//
// There used to be no way to do this that anybody could find: a double-click
// on the pill, no confirmation, and their medicines left behind in storage
// under an id that no longer named anybody.
await browser.evaluate(`
  localStorage.setItem('profiles', JSON.stringify([
    { id: 'me', name: 'Me' },
    { id: 'pmum', name: 'Mum' },
  ]));
  localStorage.setItem('activeProfile', 'pmum');
  const all = JSON.parse(localStorage.getItem('myMedications') || '[]');
  const one = all[0];
  localStorage.setItem('myMedications', JSON.stringify([
    { ...one, profileId: 'me' },
    { ...one, profileId: 'pmum' },
    { ...one, profileId: 'pmum', drugInfo: { ...one.drugInfo, drugName: 'Metformin', brandName: 'Metformin' } },
  ]));
  return 'seeded';
`);
await browser.goto(BASE);
await openMedicines();

const affordance = await browser.evaluate(`
  const pills = [...document.querySelectorAll('[data-testid="profiles"] > div')];
  const removes = [...document.querySelectorAll('[data-testid="remove-profile"]')];
  return {
    pills: pills.length,
    removeCount: removes.length,
    removeLabel: removes[0] ? removes[0].getAttribute('aria-label') : null,
    // The one it sits on must be the one that is selected.
    onSelected: removes[0] ? removes[0].closest('div').querySelector('[aria-pressed="true"]') !== null : false,
    hers: [...document.querySelectorAll('[data-testid="medicine-list"] > div')].length,
  };
`);
check('the person you are looking at carries a remove button', affordance.removeCount === 1,
  `${affordance.removeCount} of ${affordance.pills} pills`);
check('it names who it removes', /Mum/.test(affordance.removeLabel || ''), affordance.removeLabel);
check('and it is on the selected pill, not a different one', affordance.onSelected);
check('her two medicines are listed', affordance.hers === 2, String(affordance.hers));

// The default person has to survive: something owns the medicines saved
// before anybody thought about profiles.
const onMe = await browser.evaluate(`
  [...document.querySelectorAll('[data-testid="profiles"] button')].find(b => /Me/.test(b.innerText)).click();
  await new Promise(r => setTimeout(r, 500));
  return document.querySelectorAll('[data-testid="remove-profile"]').length;
`);
check('the default person cannot be removed', onMe === 0, String(onMe));

const asked = await browser.evaluate(`
  [...document.querySelectorAll('[data-testid="profiles"] button')].find(b => /Mum/.test(b.innerText)).click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-testid="remove-profile"]').click();
  await new Promise(r => setTimeout(r, 500));
  const sheet = document.querySelector('[data-testid="remove-profile-sheet"]');
  return {
    shown: !!sheet,
    heading: sheet ? sheet.querySelector('h2').textContent.trim() : null,
    body: sheet ? sheet.querySelector('p').textContent.trim() : null,
  };
`);
check('removing asks first', asked.shown, JSON.stringify(asked));
check('the question names the person', /Mum/.test(asked.heading || ''), asked.heading);
// The count is the whole point of asking: "remove Mum" and "remove Mum and
// the two medicines saved for her" are different decisions.
check('and says how many medicines go with them', /\b2\b/.test(asked.body || ''), asked.body);

const cancelled = await browser.evaluate(`
  document.querySelector('[data-testid="remove-profile-cancel"]').click();
  await new Promise(r => setTimeout(r, 400));
  return {
    sheetGone: !document.querySelector('[data-testid="remove-profile-sheet"]'),
    stillThere: JSON.parse(localStorage.getItem('profiles')).some(p => p.name === 'Mum'),
    medicines: JSON.parse(localStorage.getItem('myMedications')).length,
  };
`);
check('cancelling changes nothing', cancelled.sheetGone && cancelled.stillThere && cancelled.medicines === 3,
  JSON.stringify(cancelled));

const removed = await browser.evaluate(`
  document.querySelector('[data-testid="remove-profile"]').click();
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-testid="remove-profile-confirm"]').click();
  await new Promise(r => setTimeout(r, 700));
  const meds = JSON.parse(localStorage.getItem('myMedications') || '[]');
  return {
    profiles: JSON.parse(localStorage.getItem('profiles')).map(p => p.name),
    active: localStorage.getItem('activeProfile'),
    orphans: meds.filter(m => m.profileId === 'pmum').length,
    mine: meds.filter(m => m.profileId === 'me').map(m => m.drugInfo.drugName),
    listed: [...document.querySelectorAll('[data-testid="medicine-list"] > div')].map(c => c.innerText.split('\\n')[0]),
  };
`);
check('confirming removes the person', !removed.profiles.includes('Mum'), JSON.stringify(removed.profiles));
// The bug this is really guarding: their medicines used to stay in storage
// for ever, invisible, under an id that named nobody.
check('and takes their medicines with them', removed.orphans === 0, `${removed.orphans} left behind`);
check('while leaving your own list alone',
  removed.mine.length === 1 && removed.mine[0] === 'Lipitor', JSON.stringify(removed.mine));
check('and you are put back on a person who exists', removed.active === 'me', String(removed.active));
check('showing that person’s list', removed.listed.length === 1 && /Lipitor/.test(removed.listed[0]),
  JSON.stringify(removed.listed));

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
