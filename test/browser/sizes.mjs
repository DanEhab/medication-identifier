// Every screen at every size an Android phone actually is.
//
// "It looks right on my phone" is one data point. These are the viewports real
// devices report to a WebView, from the smallest phone still receiving updates
// to a large tablet, and every screen in the app is walked at each of them.
//
// What is checked is not how it looks — that is what the screenshots are for —
// but the four things that make a layout broken rather than merely different:
// something running off the side, text too small to read, a tap target too
// small to hit, and content hidden under a bar that is fixed over it.
import { openApp, check, finish, reachCamera, reachFirstRun, searchFor, BASE } from './_harness.mjs';

/*
  CSS pixels, which is what layout sees — not the marketing resolution. A
  Pixel 7 is 1080 physical pixels wide and 412 to a web page.
*/
const SIZES = [
  { name: 'small (Galaxy A03, 5")', width: 320, height: 568 },
  { name: 'common budget (Redmi 9A)', width: 360, height: 640 },
  { name: 'mid (Galaxy A54)', width: 384, height: 854 },
  { name: 'Pixel 7', width: 412, height: 892 },
  { name: 'large (Galaxy S24 Ultra)', width: 428, height: 926 },
  { name: 'fold, open', width: 674, height: 842 },
  { name: 'tablet (Galaxy Tab A9)', width: 800, height: 1280 },
];

/**
 * Android's own minimum touch target is 48dp; iOS asks for 44pt. Anything
 * smaller than 40 is a control somebody with ordinary fingers will miss, and
 * the people using this app are frequently older.
 */
const MIN_TAP = 40;

/** Below this nothing is comfortably readable on a phone held at arm's length. */
const MIN_TEXT = 12;

const audit = (browser, label) => browser.evaluate(`
  const problems = { overflow: null, tiny: [], small: [], covered: [] };

  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the widest thing, or the report is "something overflows" and the
    // next step is opening dev tools by hand.
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0) continue;
      const over = Math.max(box.right - doc.clientWidth, -box.left);
      if (over > 1 && (!worst || over > worst.over)) {
        worst = { over: Math.round(over), tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 60), text: (el.textContent || '').trim().slice(0, 30) };
      }
    }
    problems.overflow = { by: Math.round(doc.scrollWidth - doc.clientWidth), worst };
  }

  const seen = new Set();
  for (const el of document.querySelectorAll('button, a[href], input, select, [role="radio"], [data-tab]')) {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    const smallest = Math.min(box.width, box.height);
    if (smallest < ${MIN_TAP}) {
      const key = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      problems.small.push({ what: key, size: Math.round(smallest) });
    }
  }

  for (const el of document.querySelectorAll('p, span, div, h1, h2, h3, button, label')) {
    const text = (el.textContent || '').trim();
    if (!text || el.children.length > 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size && size < ${MIN_TEXT}) problems.tiny.push({ text: text.slice(0, 24), size });
  }

  /*
    Anything the tab bar is sitting on top of. The bar is fixed to the foot of
    the screen, so a card that ends underneath it is a card whose last line
    nobody can read and whose button nobody can press.
  */
  const bar = document.querySelector('nav[aria-label]');
  if (bar) {
    const barTop = bar.getBoundingClientRect().top;
    for (const el of document.querySelectorAll('[data-testid="medicine-list"] > div, main > *, h1')) {
      const box = el.getBoundingClientRect();
      if (box.height === 0) continue;
      if (box.top < barTop && box.bottom > barTop + 4 && box.top > 0) {
        problems.covered.push({ what: (el.textContent || '').trim().slice(0, 24), by: Math.round(box.bottom - barTop) });
      }
    }
  }
  return problems;
`);

const report = (label, size, problems) => {
  const where = `${size.name} ${size.width}x${size.height} — ${label}`;
  check(`${where}: nothing runs off the side`, problems.overflow === null,
    problems.overflow ? JSON.stringify(problems.overflow) : '');
  check(`${where}: no text below ${MIN_TEXT}px`, problems.tiny.length === 0,
    JSON.stringify(problems.tiny.slice(0, 3)));
  check(`${where}: every control is at least ${MIN_TAP}px`, problems.small.length === 0,
    JSON.stringify(problems.small.slice(0, 3)));
  check(`${where}: nothing is buried under the tab bar`, problems.covered.length === 0,
    JSON.stringify(problems.covered.slice(0, 2)));
};

for (const size of SIZES) {
  const browser = await openApp({});
  await browser.page.send('Emulation.setDeviceMetricsOverride', {
    width: size.width, height: size.height, deviceScaleFactor: 2, mobile: true,
  });

  // The camera, which is the one screen sized from what is left over.
  await reachCamera(browser);
  report('camera', size, await audit(browser, 'camera'));

  // The saved list, whose pills wrap and whose cards are the tallest content.
  await browser.evaluate(`
    document.querySelector('[data-tab="medicines"]').click();
    await new Promise(r => setTimeout(r, 700));
    return 'ok';
  `);
  report('medicines', size, await audit(browser, 'medicines'));

  // Settings, which is the longest screen and the one with segmented controls.
  await browser.evaluate(`
    document.querySelector('[data-testid="open-settings"]').click();
    await new Promise(r => setTimeout(r, 700));
    return 'ok';
  `);
  report('settings', size, await audit(browser, 'settings'));

  // A medicine, which is where the real text lives.
  await browser.evaluate(`
    document.querySelector('[data-testid="settings"] header button').click();
    await new Promise(r => setTimeout(r, 500));
    document.querySelector('[data-tab="scan"]').click();
    await new Promise(r => setTimeout(r, 700));
    return 'ok';
  `);
  const reached = await searchFor(browser, 'Lipitor');
  if (reached === 'ok') report('a medicine', size, await audit(browser, 'result'));
  else check(`${size.name}: a medicine can be opened`, false, reached);

  await browser.close();
}

// ── The first screen, which has its own rules ─────────────────────────────
for (const size of [SIZES[0], SIZES[3], SIZES[6]]) {
  const browser = await openApp({ firstRun: true });
  await browser.page.send('Emulation.setDeviceMetricsOverride', {
    width: size.width, height: size.height, deviceScaleFactor: 2, mobile: true,
  });
  await reachFirstRun(browser);
  report('first run', size, await audit(browser, 'firstrun'));

  // The accept button has to be reachable without scrolling past the notice.
  const reachable = await browser.evaluate(`
    const accept = document.querySelector('[role="dialog"] button:not([aria-pressed])');
    const box = accept.getBoundingClientRect();
    return { onScreen: box.bottom <= window.innerHeight + 1 && box.top >= 0, top: Math.round(box.top), h: window.innerHeight };
  `);
  check(`${size.name}: the accept button is on screen without scrolling`, reachable.onScreen,
    JSON.stringify(reachable));
  await browser.close();
}

await finish(await openApp({}));
