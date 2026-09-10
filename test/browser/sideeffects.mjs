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
check('missed dose is here', screen.hasMissed);
check('food and drink is not lost', screen.hasFood);
check('storage is here', screen.hasStorage);
check('the share card and the AI note are present', screen.hasStillUnsure && screen.hasAiNote);
check('nothing overflows sideways', !screen.overflows);

check('back returns to the result screen', (await goBack(browser)) === 'ok');
check('and it is the result screen', await browser.evaluate(`
  return !!document.querySelector('[data-tutorial="quick-facts"]');
`));

// ── The other two chips land on their own section ─────────────────────────
for (const [index, label, marker] of [[1, 'Missed dose', 'IF YOU MISS A DOSE'], [2, 'Storage', 'STORAGE']]) {
  const landed = await browser.evaluate(`
    document.querySelectorAll('[data-tutorial="detail-chips"] button')[${index}].click();
    await new Promise(r => setTimeout(r, 700));
    const target = [...document.querySelectorAll('.font-mono')]
      .find(l => l.textContent.trim() === ${JSON.stringify(marker)});
    const box = target ? target.getBoundingClientRect() : null;
    const result = {
      found: !!target,
      // This fixture's page only scrolls a few hundred pixels, so both anchors
      // bottom out and the section ends up visible rather than pinned to the
      // top. What matters either way: the screen scrolled, and the asked-for
      // section is on it.
      inView: box ? box.top >= 40 && box.top < window.innerHeight : false,
      scrolled: Math.round(window.scrollY),
    };
    [...document.querySelectorAll('button')]
      .find(b => /back/i.test(b.getAttribute('aria-label') || '')).click();
    await new Promise(r => setTimeout(r, 500));
    return result;
  `);
  check(`the ${label} chip scrolls to its own section`,
    landed.found && landed.inView && landed.scrolled > 0, JSON.stringify(landed));
}

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
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 700));
  return {
    dir: document.documentElement.dir,
    heading: (document.querySelector('h2') || {}).textContent,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hasArabicLabels: /\\u0625\\u0630\\u0627 \\u0641\\u0627\\u062a\\u062a\\u0643 \\u062c\\u0631\\u0639\\u0629/.test(document.body.innerText),
  };
`);
check('the side effects screen is right to left', arabic.dir === 'rtl', arabic.dir);
check('its labels are Arabic', arabic.hasArabicLabels, arabic.heading);
check('nothing overflows in Arabic', !arabic.overflows);

await screenshot(browser, 'sideeffects-ar', import.meta.url);
await finish(browser);
