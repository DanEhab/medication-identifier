// Search: the typed path, first-class.
import {
  openApp, check, finish, screenshot, BASE,
  reachCamera, goBack,
} from './_harness.mjs';

// What the deployed /api/suggest returns, in its real shape.
const REMOTE = [
  { name: 'Atorvastatin', detail: 'Atorvastatin calcium · 10, 20, 40, 80 mg' },
  { name: 'Atorvastatin + ezetimibe', detail: 'Atorvastatin + ezetimibe · 20/10 mg' },
];

const browser = await openApp({ suggestions: REMOTE });

const openSearch = () => browser.evaluate(`
  const typeBtn = [...document.querySelectorAll('button')]
    .find(b => /type the name|\\u0627\\u0643\\u062a\\u0628/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button';
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  return document.querySelector('input[type="search"]') ? 'ok' : document.body.innerText.slice(0, 140);
`);

const type = (text) => browser.evaluate(`
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(text)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 700));
  return true;
`);

const rows = () => browser.evaluate(`
  return [...document.querySelectorAll('[role="listbox"] button')].map(b => b.innerText.replace(/\\n/g, ' | '));
`);

check('the camera screen is reached', (await reachCamera(browser)) === 'ok');
check('the search screen opens from the camera', (await openSearch()) === 'ok');

// ── The field is ready to type into ───────────────────────────────────────
const ready = await browser.evaluate(`
  const input = document.querySelector('input[type="search"]');
  return {
    focused: document.activeElement === input,
    placeholder: input.placeholder,
    enterKey: input.getAttribute('enterkeyhint'),
    hasHint: /Point the camera at the box/.test(document.body.innerText),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the keyboard opens on arrival', ready.focused);
check('the field says what to type', /name on the pack/i.test(ready.placeholder), ready.placeholder);
check('the keyboard offers a search key', ready.enterKey === 'search', ready.enterKey);
check('the camera hint is offered for names people cannot spell', ready.hasHint);
check('nothing overflows sideways', !ready.overflows);

// ── One letter is a directory, not a suggestion ───────────────────────────
await type('a');
const oneLetter = await browser.evaluate(`
  return { rows: document.querySelectorAll('[role="listbox"] button').length, calls: window.__suggestCalls.length };
`);
check('one letter asks the server nothing and shows nothing',
  oneLetter.rows === 0 && oneLetter.calls === 0, JSON.stringify(oneLetter));

// ── Suggestions from the server ───────────────────────────────────────────
await type('atorva');
const suggested = await rows();
check('the server suggestions are listed', suggested.length === 2, JSON.stringify(suggested));
check('each carries its ingredient and strengths',
  suggested.some((row) => /10, 20, 40, 80 mg/.test(row)), JSON.stringify(suggested));

const highlight = await browser.evaluate(`
  const strong = document.querySelector('[role="listbox"] strong');
  return strong ? strong.textContent : null;
`);
// The name's own capitalisation is kept, so "atorva" bolds "Atorva".
check('the typed part is picked out in the name',
  (highlight || '').toLowerCase() === 'atorva', String(highlight));

const debounced = await browser.evaluate(`
  const before = window.__suggestCalls.length;
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const text of ['ato', 'ator', 'atorv', 'atorva', 'atorvas']) {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => setTimeout(r, 800));
  return { asked: window.__suggestCalls.length - before, last: window.__suggestCalls.at(-1) };
`);
check('typing fast asks the server once, not once per key', debounced.asked === 1, JSON.stringify(debounced));
check('and it asks for what was actually typed', /q=atorvas$/.test(debounced.last || ''), debounced.last);

// ── A name nobody has searched still works ────────────────────────────────
await browser.evaluate(`window.__suggestions = []; return 'cleared';`);
await type('zzzqqq');
const fallback = await browser.evaluate(`
  const btn = [...document.querySelectorAll('button')].find(b => /Search for/.test(b.innerText));
  return { offered: !!btn, label: btn ? btn.innerText.replace(/\\n/g, ' ') : null };
`);
check('an unknown name still offers to search for it', fallback.offered, fallback.label);
check('and the offer quotes what was typed', /zzzqqq/.test(fallback.label || ''), fallback.label);

const searched = await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => /Search for/.test(b.innerText)).click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="quick-facts"]')) return 'ok';
  }
  return document.body.innerText.slice(0, 140);
`);
check('searching reaches the result screen', searched === 'ok', searched);

const recorded = await browser.evaluate(`return JSON.parse(localStorage.getItem('recentSearches') || '[]');`);
check('the successful lookup was recorded as recent', recorded.includes('zzzqqq'), JSON.stringify(recorded));

// ── A failed lookup comes back here, not to the camera ────────────────────
const afterFailure = await browser.evaluate(`
  const back = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
  back.click();
  await new Promise(r => setTimeout(r, 600));
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('/api/suggest')) return new Response(JSON.stringify({ suggestions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/api/generate')) return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    return realFetch(input, init);
  };
  [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || '')).click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'brokenlookup');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 700));
  input.form.requestSubmit();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('input[type="search"]')) break;
  }
  await new Promise(r => setTimeout(r, 600));
  return {
    backOnSearch: !!document.querySelector('input[type="search"]'),
    showsError: /unavailable|wrong|error/i.test(document.body.innerText),
    recents: JSON.parse(localStorage.getItem('recentSearches') || '[]'),
  };
`);
check('a failed lookup comes back to the search screen, not the camera', afterFailure.backOnSearch);
check('and says what went wrong there', afterFailure.showsError, JSON.stringify(afterFailure).slice(0, 140));
check('a failed lookup is not recorded as recent',
  !afterFailure.recents.includes('brokenlookup'), JSON.stringify(afterFailure.recents));

// ── The phone answers with no server at all ───────────────────────────────
await browser.evaluate(`
  localStorage.setItem('recentSearches', JSON.stringify(['Panadol Extra', 'Metformin']));
  localStorage.setItem('myMedications', JSON.stringify([{
    drugInfo: { drugName: 'Ventolin', brandName: 'Ventolin', canonicalName: 'Salbutamol', strength: '100 mcg',
      commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [], commonUse: '', dosageAdministration: '',
      foodDrinkEffect: '', missedDose: '', storage: '' },
    language: 'en', originalName: 'Ventolin', profileId: 'me', savedAt: new Date().toISOString(),
  }]));
  return 'seeded';
`);
await browser.goto(BASE);
check('the app reopens', (await reachCamera(browser)) === 'ok');
check('the search screen reopens', (await openSearch()) === 'ok');

const recentChips = await browser.evaluate(`
  return [...document.querySelectorAll('button')].map(b => b.innerText.trim())
    .filter(t => t === 'Panadol Extra' || t === 'Metformin');
`);
check('recent searches are offered as chips before typing', recentChips.length === 2, JSON.stringify(recentChips));

await browser.evaluate(`
  const realFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(input && input.url ? input.url : input);
    if (url.includes('/api/suggest')) throw new Error('offline');
    return realFetch(input, init);
  };
  return 'offline';
`);
await type('vent');
const savedRow = await rows();
check('a saved medicine suggests with no server at all',
  savedRow.some((row) => /Ventolin/.test(row)), JSON.stringify(savedRow));
check('and shows what it is', savedRow.some((row) => /Salbutamol/.test(row)), JSON.stringify(savedRow));

await type('pana');
const recentRow = await rows();
check('a recent search suggests too', recentRow.some((row) => /Panadol Extra/.test(row)), JSON.stringify(recentRow));

await screenshot(browser, 'search-en', import.meta.url);

// ── Arabic ────────────────────────────────────────────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto(BASE);
check('Arabic reaches the camera', (await reachCamera(browser)) === 'ok');
check('Arabic opens the search screen', (await openSearch()) === 'ok');

const arabic = await browser.evaluate(`
  const input = document.querySelector('input[type="search"]');
  return {
    dir: document.documentElement.dir,
    placeholder: input.placeholder,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hint: /\\u0627\\u0644\\u0643\\u0627\\u0645\\u064a\\u0631\\u0627/.test(document.body.innerText),
  };
`);
check('the search screen is right to left', arabic.dir === 'rtl', arabic.dir);
check('its placeholder is Arabic', /[؀-ۿ]/.test(arabic.placeholder), arabic.placeholder);
check('the camera hint is Arabic', arabic.hint);
check('nothing overflows in Arabic', !arabic.overflows);

await screenshot(browser, 'search-ar', import.meta.url);
await finish(browser);
