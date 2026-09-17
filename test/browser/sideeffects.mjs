// Side effects: mild and urgent, told apart.
import {
  openApp, check, finish, screenshot,
  reachCamera, searchFor, goBack,
} from './_harness.mjs';

const browser = await openApp();

check('the result screen is reached', (await reachCamera(browser)) === 'ok');
check('with a medicine on it', (await searchFor(browser, 'Lipitor')) === 'ok');

// ── The chips navigate rather than expanding in place ─────────────────────
const chips = await browser.evaluate(`
  const chips = [...document.querySelectorAll('[data-tutorial="detail-chips"] button')];
  return {
    count: chips.length,
    labels: chips.map(c => c.textContent.trim()),
    noneClaimExpansion: chips.every(c => c.getAttribute('aria-expanded') === null),
  };
`);
check('three chips, none of them an expander',
  chips.count === 3 && chips.noneClaimExpansion, JSON.stringify(chips.labels));

const screen = await browser.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 600));
  const text = document.body.innerText;
  const serious = [...document.querySelectorAll('div')].find(d =>
    /STOP AND GET HELP TODAY/.test(d.textContent || '') && d.className.includes('rounded-[16px]'));
  return {
    heading: (document.querySelector('h2') || {}).textContent.trim(),
    header: (document.querySelector('.sticky') || {}).innerText,
    hasCommon: /COMMON — USUALLY MILD/.test(text),
    hasHeadache: /Headache/.test(text),
    hasSerious: /STOP AND GET HELP TODAY/.test(text),
    hasDarkUrine: /dark urine/.test(text),
    hasMissed: /IF YOU MISS A DOSE/.test(text) && /twelve hours/.test(text),
    hasFood: /FOOD AND DRINK/.test(text) && /raises the level/.test(text),
    hasStorage: /STORAGE/.test(text) && /original pack/.test(text),
    hasConsult: /CALL YOUR DOCTOR IF/.test(text) && /become pregnant/.test(text),
    hasStillUnsure: /Still unsure\\?/.test(text),
    hasAiNote: /AI-generated information/.test(text),
    seriousBorder: serious ? getComputedStyle(serious).borderColor : null,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);

check('the side effects chip opens the screen', screen.hasCommon, JSON.stringify(screen).slice(0, 160));
check('the header names the medicine', /Lipitor/.test(screen.header || ''), screen.header);
check('the heading claims nothing about how many people get them',
  screen.heading === 'Not everyone gets these', screen.heading);
check('common effects are listed', screen.hasHeadache);
check('the urgent list is separate, behind a clay border',
  screen.hasSerious && screen.hasDarkUrine && screen.seriousBorder === 'rgb(231, 189, 180)',
  screen.seriousBorder);
check('when to call a doctor is not lost', screen.hasConsult);
/*
  And nothing else, which is the point of it.

  All three chips used to open this page and scroll it to a different place, so
  "Storage" landed you in the middle of the side effects with two other
  subjects a flick away in either direction. A screen about side effects that
  also contains the storage advice is not a screen about side effects.
*/
check('the side effects screen carries only side effects',
  !screen.hasMissed && !screen.hasStorage,
  `missed=${screen.hasMissed} storage=${screen.hasStorage}`);
check('and food is not buried in it either', !screen.hasFood);

/*
  ── The two warning lists do not repeat each other ────────────────────────

  Both are filled from the same knowledge, so the urgent items came back in the
  gentler list as well, written out as sentences. Two lists that overlap make a
  reader work out whether the repeated item means something different the
  second time, and it does not.
*/
const warnings = await browser.evaluate(`
  const cards = [...document.querySelectorAll('[class*="rounded-[16px]"]')];
  const find = (marker) => {
    const card = cards.find(c => (c.textContent || '').includes(marker));
    return card ? [...card.querySelectorAll('div > span:last-child')].map(s => s.innerText.trim()) : null;
  };
  const text = document.body.innerText;
  return {
    urgent: find('STOP AND GET HELP TODAY'),
    consult: find('CALL YOUR DOCTOR IF'),
    repeatShown: /notice muscle pain along with dark urine/i.test(text),
    ownReasonShown: /You become pregnant/.test(text),
    // All three lists are three of a kind now, so their headings match.
    headingSizes: [...document.querySelectorAll('h3')].map(h => getComputedStyle(h).fontSize),
  };
`);
check('the reason that only this list has is kept', warnings.ownReasonShown,
  JSON.stringify(warnings.consult));
check('and the one that repeats an urgent effect is dropped', !warnings.repeatShown,
  JSON.stringify(warnings.consult));
check('the three lists share one heading size',
  warnings.headingSizes.length === 3 && new Set(warnings.headingSizes).size === 1,
  JSON.stringify(warnings.headingSizes));
check('the share card and the AI note are present', screen.hasStillUnsure && screen.hasAiNote);
check('nothing overflows sideways', !screen.overflows);

check('back returns to the result screen', (await goBack(browser)) === 'ok');
check('and it is the result screen', await browser.evaluate(`
  return !!document.querySelector('[data-tutorial="quick-facts"]');
`));

/*
  ── Each of the other two opens its own screen ────────────────────────────

  Not a scroll position on a shared page. What that looked like: tapping
  "Storage" put you partway down the side effects with the heading "Not
  everyone gets these" above you and the storage paragraph somewhere below,
  and scrolling either way left the subject you asked for.
*/
const SUBJECTS = [
  {
    index: 1,
    label: 'Missed dose',
    testid: 'chip-missedDose',
    headline: 'If you forget one',
    own: /twelve hours/,
    others: [/COMMON — USUALLY MILD/, /original pack/],
  },
  {
    index: 2,
    label: 'Storage',
    testid: 'chip-storage',
    headline: 'Keeping it safe',
    own: /original pack/,
    others: [/COMMON — USUALLY MILD/, /twelve hours/],
  },
];

for (const subject of SUBJECTS) {
  const landed = await browser.evaluate(`
    document.querySelector('[data-testid=${JSON.stringify(subject.testid)}]').click();
    await new Promise(r => setTimeout(r, 700));
    const text = document.body.innerText;
    const result = {
      headline: (document.querySelector('h2') || {}).textContent.trim(),
      header: (document.querySelector('.sticky') || {}).innerText,
      text,
      // Nothing to scroll past: the subject is the top of the screen.
      scrolled: Math.round(window.scrollY),
    };
    [...document.querySelectorAll('button')]
      .find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
    await new Promise(r => setTimeout(r, 500));
    return result;
  `);

  check(`the ${subject.label} row opens a screen titled for it`,
    landed.headline === subject.headline, landed.headline);
  check(`and it still names the medicine`, /Lipitor/.test(landed.header || ''), landed.header);
  check(`and it answers the question that was asked`,
    subject.own.test(landed.text), landed.text.slice(0, 120));
  check(`and carries none of the other two subjects`,
    subject.others.every((pattern) => !pattern.test(landed.text)),
    landed.text.slice(0, 200));
  check(`and opens at the top, with nothing to scroll past`, landed.scrolled === 0,
    String(landed.scrolled));
}

/*
  ── Reached the way a person reaches it ───────────────────────────────────

  The rows are near the foot of a medicine page, so you have scrolled to get
  to them. Every screen renders into the same scrolling document, and nothing
  reset the position — so the reference screen opened part of the way down,
  with its own heading above the fold. It read as a page that opened at the
  bottom, because it had.

  The checks above never caught it: they clicked the row by selector from a
  page that happened to be at the top.
*/
const afterScrolling = await browser.evaluate(`
  const chip = document.querySelector('[data-testid="chip-sideEffects"]');
  chip.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 400));
  const before = Math.round(window.scrollY);
  chip.click();
  await new Promise(r => setTimeout(r, 800));
  const heading = document.querySelector('h2');
  const box = heading ? heading.getBoundingClientRect() : null;
  const result = {
    before,
    after: Math.round(window.scrollY),
    headingOnScreen: box ? box.top >= 0 && box.top < innerHeight : false,
  };
  document.querySelector('.sticky button').click();
  await new Promise(r => setTimeout(r, 600));
  return result;
`);
check('scrolling down to the row and tapping it still opens at the top',
  afterScrolling.before > 100 && afterScrolling.after === 0, JSON.stringify(afterScrolling));
check('so its heading is the first thing on screen', afterScrolling.headingOnScreen,
  JSON.stringify(afterScrolling));

/*
  Coming back is a return, not an arrival. Dropping somebody at the top of a
  page they were halfway down — to make them scroll to the rows they were
  using — would be its own small rudeness.
*/
const returned = await browser.evaluate(`
  const chip = document.querySelector('[data-testid="chip-storage"]');
  chip.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 400));
  const before = Math.round(window.scrollY);
  chip.click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('.sticky button').click();
  await new Promise(r => setTimeout(r, 800));
  return { before, backAt: Math.round(window.scrollY) };
`);
check('and coming back puts you where you left the medicine',
  Math.abs(returned.backAt - returned.before) < 40, JSON.stringify(returned));

// ── Saving works from here too ────────────────────────────────────────────
const saved = await browser.evaluate(`
  localStorage.removeItem('myMedications');
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 600));
  const btn = document.querySelector('[data-tutorial="save-medicine"]');
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const list = JSON.parse(localStorage.getItem('myMedications') || '[]');
  return { label: btn.innerText.trim(), names: list.map(m => m.drugInfo.drugName) };
`);
check('saving works from the side effects screen',
  /Saved/i.test(saved.label) && saved.names.length === 1 && saved.names[0] === 'Lipitor',
  JSON.stringify(saved));

await browser.evaluate(`window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));`);
await screenshot(browser, 'sideeffects-en', import.meta.url);

// ── Arabic ────────────────────────────────────────────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto('http://localhost:4173');
check('Arabic reaches the result screen', (await reachCamera(browser)) === 'ok');
check('and a medicine', (await searchFor(browser, 'Lipitor')) === 'ok');

const arabic = await browser.evaluate(`
  document.querySelector('[data-testid="chip-sideEffects"]').click();
  await new Promise(r => setTimeout(r, 700));
  return {
    dir: document.documentElement.dir,
    heading: (document.querySelector('h2') || {}).textContent.trim(),
    // The screen's own label, not a neighbouring subject's: "common — usually
    // mild" is what this page is, and it has to be in Arabic.
    hasArabicLabels: /\\u0634\\u0627\\u0626\\u0639\\u0629/.test(document.body.innerText),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the side effects screen is right to left', arabic.dir === 'rtl', arabic.dir);
check('its heading is Arabic', /[؀-ۿ]/.test(arabic.heading), arabic.heading);
check('its labels are Arabic', arabic.hasArabicLabels, arabic.heading);
check('nothing overflows in Arabic', !arabic.overflows);

/*
  And the other two subjects are Arabic screens of their own, not one page in
  Arabic reached three ways.
*/
for (const [testid, expected] of [['chip-missedDose', 'لو نسيت جرعة'], ['chip-storage', 'طريقة الحفظ']]) {
  const other = await browser.evaluate(`
    // The back control by position rather than by its label, which is Arabic
    // here: it is the first button in the screen's own sticky header.
    document.querySelector('.sticky button').click();
    await new Promise(r => setTimeout(r, 600));
    document.querySelector('[data-testid=${JSON.stringify(testid)}]').click();
    await new Promise(r => setTimeout(r, 700));
    return {
      heading: (document.querySelector('h2') || {}).textContent.trim(),
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  `);
  check(`ar: ${testid} opens its own screen`, other.heading === expected, other.heading);
  check(`ar: and nothing overflows on it`, !other.overflows);
}

await screenshot(browser, 'sideeffects-ar', import.meta.url);
await finish(browser);
