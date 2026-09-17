// Settings.
//
// Three things the app could already do had no way to be asked for. The theme
// followed the phone with no override, the tour could be seen once and never
// again, and the language could only be changed from the camera. Each of those
// is a line of state that already worked, so what needs proving is not the
// state but the control: that tapping it reaches the state, and that the screen
// reports back what is actually in effect.
import { openApp, check, finish, screenshot, reachCamera, searchFor, BASE } from './_harness.mjs';

const ground = (browser) => browser.evaluate(`
  return getComputedStyle(document.body).backgroundColor;
`);

const openSettings = (browser) => browser.evaluate(`
  const gear = document.querySelector('[data-testid="open-settings"]');
  if (!gear) return 'no way in: ' + document.body.innerText.slice(0, 120);
  gear.click();
  await new Promise(r => setTimeout(r, 600));
  return document.querySelector('[data-testid="settings"]') ? 'ok' : document.body.innerText.slice(0, 120);
`);

const browser = await openApp({});
check('the camera is reached', (await reachCamera(browser)) === 'ok');

// ── Getting there from each of the three tabs ──────────────────────────────
check('settings opens from the camera', (await openSettings(browser)) === 'ok');

const back = (target) => browser.evaluate(`
  document.querySelector('[data-testid="settings"] header button').click();
  await new Promise(r => setTimeout(r, 600));
  return !!document.querySelector('${target}');
`);
check('and back returns to the camera, not somewhere else', await back('[data-tutorial="shutter"]'));

for (const [tab, marker] of [['medicines', '[data-testid="profiles"]'], ['search', 'input[type="search"]']]) {
  const reached = await browser.evaluate(`
    document.querySelector('[data-tab="${tab}"]').click();
    await new Promise(r => setTimeout(r, 700));
    return !!document.querySelector('${marker}');
  `);
  check(`the ${tab} tab is reached`, reached);
  check(`settings opens from ${tab} too`, (await openSettings(browser)) === 'ok');
  // Back goes where you came from, which is the whole reason it is remembered.
  check(`and back returns to ${tab}`, await back(marker));
}

// ── Appearance ─────────────────────────────────────────────────────────────
await openSettings(browser);
await screenshot(browser, 'settings-light', import.meta.url);

const initial = await browser.evaluate(`
  const selected = [...document.querySelectorAll('[role="radio"]')]
    .filter(r => r.getAttribute('aria-checked') === 'true')
    .map(r => r.textContent.trim());
  return { selected, dark: document.documentElement.classList.contains('dark') };
`);
check('a fresh install is following the phone', initial.selected[0] === 'Automatic', JSON.stringify(initial.selected));
check('which is light here', !initial.dark);

const lightGround = await ground(browser);
const wentDark = await browser.evaluate(`
  document.querySelector('[data-testid="option-dark"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('app-theme'),
    checked: document.querySelector('[data-testid="option-dark"]').getAttribute('aria-checked'),
    colorScheme: document.documentElement.style.colorScheme,
  };
`);
check('choosing Dark turns the app dark', wentDark.dark, JSON.stringify(wentDark));
check('and the choice is remembered', wentDark.stored === 'dark', String(wentDark.stored));
check('and the button says so', wentDark.checked === 'true');
// Without this the browser draws its own furniture — scrollbar, form controls,
// the flash between navigations — in the wrong theme.
check('the browser is told as well', wentDark.colorScheme === 'dark', wentDark.colorScheme);

const darkGround = await ground(browser);
check('the page really repainted, not just the class', darkGround !== lightGround, `${lightGround} -> ${darkGround}`);
await screenshot(browser, 'settings-dark', import.meta.url);

// Legibility on the screen that just changed the theme, since it is the one
// place somebody is guaranteed to be looking when it changes.
const legible = await browser.evaluate(`
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const backdrop = (el) => {
    const stack = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) { stack.push(bg); if (bg.a === 1) break; }
    }
    let result = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) result = over(stack[i], result);
    return result;
  };
  const bad = [];
  for (const el of document.querySelectorAll('[data-testid="settings"] h1, [data-testid="settings"] p, [data-testid="settings"] span, [data-testid="settings"] button')) {
    const text = (el.textContent || '').trim();
    if (!text || el.querySelector('*')) continue;
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (!fg || fg.a === 0) continue;
    const ratio = contrast(over(fg, backdrop(el)), backdrop(el));
    // 3.0 is the large-text threshold; nothing here should be near it.
    if (ratio < 3.0) bad.push({ text: text.slice(0, 28), ratio: Number(ratio.toFixed(2)) });
  }
  return bad;
`);
check('every word on the settings screen is legible in dark', legible.length === 0, JSON.stringify(legible));

const backToAuto = await browser.evaluate(`
  document.querySelector('[data-testid="option-system"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { dark: document.documentElement.classList.contains('dark'), stored: localStorage.getItem('app-theme') };
`);
check('Automatic goes back to following the phone', !backToAuto.dark && backToAuto.stored === null,
  JSON.stringify(backToAuto));

/*
  The headings are the structure of this page.

  They were the app's small mono label — right on the result screen, where the
  label names the value directly under it — and here that made them quieter
  than the hint text under every control, so the thing you scan to find a
  setting was the least visible thing on screen.
*/
const headings = await browser.evaluate(`
  const size = (el) => parseFloat(getComputedStyle(el).fontSize);
  const settings = document.querySelector('[data-testid="settings"]');
  const sections = [...settings.querySelectorAll('h2')];
  const hint = settings.querySelector('p');
  return {
    texts: sections.map(h => h.textContent.trim()),
    sizes: sections.map(size),
    hintSize: size(hint),
    weights: sections.map(h => getComputedStyle(h).fontWeight),
  };
`);
// Appearance, Language, Reminders, Help, About.
check('every group has a real heading', headings.texts.length === 5, JSON.stringify(headings.texts));
check('and each is larger than the hint text underneath the controls',
  headings.sizes.every((s) => s > headings.hintSize),
  `${JSON.stringify(headings.sizes)} vs ${headings.hintSize}`);
check('and set in a heading weight', headings.weights.every((w) => Number(w) >= 600),
  JSON.stringify(headings.weights));

// ── Language ───────────────────────────────────────────────────────────────
/*
  The two language options must not trade places when the language changes.

  The page mirrors in Arabic, which flipped the pair — so the button you just
  pressed moved out from under your finger, and the one that would undo it was
  sitting where the first one had been.
*/
const languageOrder = () => browser.evaluate(`
  const group = [...document.querySelectorAll('[role="radiogroup"]')]
    .find(g => [...g.children].some(b => /العربية/.test(b.textContent)));
  return [...group.children].map(b => ({
    label: b.textContent.trim(),
    left: Math.round(b.getBoundingClientRect().left),
    checked: b.getAttribute('aria-checked') === 'true',
  }));
`);
const orderBefore = await languageOrder();
check('English is on the left of the language control',
  orderBefore[0].label === 'English' && orderBefore[0].left < orderBefore[1].left,
  JSON.stringify(orderBefore));

const arabic = await browser.evaluate(`
  const arabicOption = [...document.querySelectorAll('[role="radio"]')].find(r => /العربية/.test(r.textContent));
  arabicOption.click();
  await new Promise(r => setTimeout(r, 600));
  return {
    dir: document.documentElement.getAttribute('dir'),
    stored: localStorage.getItem('app-language'),
    title: (document.querySelector('[data-testid="settings"] h1') || {}).textContent,
    stillOnSettings: !!document.querySelector('[data-testid="settings"]'),
  };
`);
check('the language can be changed without leaving the medicine you are reading',
  arabic.stored === 'ar' && arabic.dir === 'rtl', JSON.stringify(arabic));
check('and the screen you are on translates under you', /[؀-ۿ]/.test(arabic.title || ''), arabic.title);
check('without navigating away from it', arabic.stillOnSettings);

const orderAfter = await languageOrder();
check('and the two language options stay exactly where they were',
  orderAfter[0].label === 'English'
  && orderAfter[0].left === orderBefore[0].left
  && orderAfter[1].left === orderBefore[1].left,
  JSON.stringify(orderAfter));
check('only the selection moves',
  !orderAfter[0].checked && orderAfter[1].checked,
  JSON.stringify(orderAfter.map((o) => `${o.label}:${o.checked}`)));

await screenshot(browser, 'settings-ar', import.meta.url);

await browser.evaluate(`
  [...document.querySelectorAll('[role="radio"]')].find(r => /English/.test(r.textContent)).click();
  await new Promise(r => setTimeout(r, 600));
  return 'ok';
`);

// ── Show me around again ───────────────────────────────────────────────────
// The tour stamps the version it was last finished at. Replaying has to clear
// both phases, or the half that explains a result would never be seen again.
const replayed = await browser.evaluate(`
  localStorage.setItem('tourSeenVersion1', '1.4.0');
  localStorage.setItem('tourSeenVersion2', '1.4.0');
  document.querySelector('[data-testid="replay-tutorial"]').click();
  await new Promise(r => setTimeout(r, 1200));
  return {
    onCamera: !!document.querySelector('[data-tutorial="shutter"]'),
    tour: !!document.querySelector('[data-testid="tour"]'),
    step: (document.querySelector('.tour-card .font-mono') || {}).textContent,
    seen1: localStorage.getItem('tourSeenVersion1'),
    seen2: localStorage.getItem('tourSeenVersion2'),
  };
`);
check('replaying takes you to the camera, where the tour starts', replayed.onCamera, JSON.stringify(replayed));
check('and the tour is running again', replayed.tour);
check('from the first step', /STEP 1 OF 5/.test(replayed.step || ''), replayed.step);
check('with the result-screen half cleared too', replayed.seen1 === null && replayed.seen2 === null,
  `${replayed.seen1} / ${replayed.seen2}`);

const finished = await browser.evaluate(`
  document.querySelector('[data-testid="tour-skip"]').click();
  await new Promise(r => setTimeout(r, 500));
  return !document.querySelector('[data-testid="tour"]');
`);
check('and it can be skipped as usual', finished);

// ── Read the notice again ──────────────────────────────────────────────────
await openSettings(browser);
const notice = await browser.evaluate(`
  document.querySelector('[data-testid="show-disclaimer"]').click();
  await new Promise(r => setTimeout(r, 800));
  return {
    shown: !!document.querySelector('#firstrun-title'),
    accepted: localStorage.getItem('disclaimerAcceptedVersion'),
  };
`);
check('the notice can be read again on demand', notice.shown, JSON.stringify(notice));

const dismissed = await browser.evaluate(`
  // The accept button is the one without aria-pressed; the two with it are
  // the language pair, which now sits at the top of the screen.
  document.querySelector('[role="dialog"] button:not([aria-pressed])').click();
  await new Promise(r => setTimeout(r, 800));
  return {
    gone: !document.querySelector('#firstrun-title'),
    stored: localStorage.getItem('disclaimerAcceptedVersion'),
  };
`);
check('and accepting it again puts you back in the app', dismissed.gone, JSON.stringify(dismissed));
check('still stamped with this version', dismissed.stored === '1.4.0', String(dismissed.stored));

// ── What it reports ────────────────────────────────────────────────────────
await browser.goto(BASE);
await reachCamera(browser);
await openSettings(browser);
const about = await browser.evaluate(`
  const text = document.querySelector('[data-testid="settings"]').innerText;
  return {
    version: /Version\\s+1\\.4\\.0/.test(text),
    // Claiming analytics that do not exist is the wrong error to make in
    // either direction, so the words are pinned.
    noTracking: /no account and no tracking/i.test(text),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('it says which version this is', about.version);
check('and what it does not collect', about.noTracking);
check('nothing overflows sideways', !about.overflows);

/*
  ── From a medicine ───────────────────────────────────────────────────────

  Everything behind the gear — the language, the theme, the tour — applies to
  the page somebody is reading, and the only way to reach it was to leave that
  page, change the setting, and search for the medicine all over again.
*/
await browser.goto(BASE);
await browser.evaluate(`
  localStorage.setItem('tourSeenVersion1', '1.4.0');
  localStorage.setItem('tourSeenVersion2', '1.4.0');
  return 'ok';
`);
await browser.goto(BASE);
await reachCamera(browser);
check('a medicine is reached', (await searchFor(browser, 'Lipitor')) === 'ok');
check('settings opens from the medicine', (await openSettings(browser)) === 'ok');

const backToMedicine = await browser.evaluate(`
  document.querySelector('[data-testid="settings"] header button').click();
  await new Promise(r => setTimeout(r, 600));
  return {
    onResult: !!document.querySelector('[data-tutorial="quick-facts"]'),
    name: (document.querySelector('h1') || {}).textContent,
  };
`);
check('and closing it returns to the same medicine', backToMedicine.onResult, backToMedicine.name);
check('with the medicine still on screen', /Lipitor/.test(backToMedicine.name || ''), backToMedicine.name);

/*
  ── Changing the language from a medicine translates the medicine ─────────

  The answer is generated in English and translated on the way to the screen,
  so the words on this page are not reactive the way the app's own labels are:
  something has to fetch it again. That something only ran while the medicine
  was the screen being looked at — which was true of every way of changing the
  language until the gear arrived on this page. From here the change happens
  while settings is on top, so it was skipped, and the remembered language was
  updated anyway, so coming back there was nothing left to notice.

  What that looked like: a right-to-left page with Arabic headings around an
  answer still in English. Exactly what it was reported as.
*/
const switched = await browser.evaluate(`
  document.querySelector('[data-testid="open-settings"]').click();
  await new Promise(r => setTimeout(r, 600));
  const arabic = [...document.querySelectorAll('[role="radio"]')]
    .find(r => /العربية|Arabic/i.test(r.textContent || ''));
  if (!arabic) return { error: 'no language control' };
  arabic.click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-testid="settings"] header button').click();
  await new Promise(r => setTimeout(r, 2500));

  const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
  const purpose = wash ? wash.innerText.split(String.fromCharCode(10)).slice(1).join(' ').trim() : '';
  const facts = [...document.querySelectorAll('[data-tutorial="quick-facts"] > div')]
    .map(f => f.innerText.replace(new RegExp(String.fromCharCode(10), 'g'), ' '));
  return {
    dir: document.documentElement.dir,
    onResult: !!document.querySelector('[data-tutorial="quick-facts"]'),
    purpose,
    purposeTranslated: /[؀-ۿ]/.test(purpose),
    facts,
    factsTranslated: facts.every(f => /[؀-ۿ]/.test(f)),
  };
`);
check('switching language from a medicine keeps you on it',
  switched.onResult && switched.dir === 'rtl', JSON.stringify(switched).slice(0, 140));
check('and the sentence that says what it does is translated',
  switched.purposeTranslated, String(switched.purpose).slice(0, 90));
check('and so are the dose, timing and food tiles',
  switched.factsTranslated, JSON.stringify(switched.facts));

// Back to English so the checks after this run in the language they expect.
await browser.evaluate(`
  document.querySelector('[data-testid="open-settings"]').click();
  await new Promise(r => setTimeout(r, 600));
  const english = [...document.querySelectorAll('[role="radio"]')]
    .find(r => /English/i.test(r.textContent || ''));
  if (english) english.click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-testid="settings"] header button').click();
  await new Promise(r => setTimeout(r, 2000));
  return 'ok';
`);

/*
  And the tour replayed from here is this page's tour.

  Asking to be shown around from a medicine means the four steps about the
  medicine. Sending somebody to the camera to find their medicine again is an
  answer to a different question.
*/
const replayedFromMedicine = await browser.evaluate(`
  document.querySelector('[data-testid="open-settings"]').click();
  await new Promise(r => setTimeout(r, 600));
  const replay = [...document.querySelectorAll('[data-testid="settings"] button')]
    .find(b => /Show me around again/i.test(b.innerText));
  if (!replay) return { error: 'no replay control' };
  replay.click();
  await new Promise(r => setTimeout(r, 1200));
  const tour = document.querySelector('[data-testid="tour"]');
  return {
    tourOpen: !!tour,
    stillOnMedicine: !!document.querySelector('[data-tutorial="quick-facts"]'),
    onCamera: !!document.querySelector('[data-tutorial="shutter"]'),
    title: tour ? (tour.querySelector('h2, h3') || {}).textContent : null,
    steps: tour ? (tour.innerText.match(/OF (\\d)/) || [])[1] : null,
  };
`);
check('replaying the tour from a medicine stays on the medicine',
  replayedFromMedicine.stillOnMedicine && !replayedFromMedicine.onCamera, JSON.stringify(replayedFromMedicine));
check('and runs the medicine page’s own four steps',
  replayedFromMedicine.tourOpen && replayedFromMedicine.steps === '4', JSON.stringify(replayedFromMedicine));

await finish(browser);
