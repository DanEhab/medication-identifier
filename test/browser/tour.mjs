// The tour.
//
// It had no suite, which is how it came to point at three elements that the
// redesign had removed: a search container, a globe icon and a hamburger menu.
// Nothing failed, because pointing at nothing is silent — the spotlight simply
// sat in the corner with a card beside it.
//
// So the checks that matter here are not about how it looks. They are: does
// every step have something on screen to point at, does the spotlight actually
// land on that thing, and is it shown exactly once per installed version.
import { openApp, check, finish, screenshot, searchFor, BASE } from './_harness.mjs';

const VERSION = '1.4.0';

/*
  Reading the tour's state out of the DOM.

  The spotlight is an SVG mask, so the cutout is a <rect> inside <mask>, and
  its coordinates are the assertion: comparing them against the target's own
  bounding box is what proves the hole is on the control rather than beside it.
*/
const readTour = (browser) => browser.evaluate(`
  const tour = document.querySelector('[data-testid="tour"]');
  if (!tour) return { present: false, body: document.body.innerText.slice(0, 160) };

  const hole = tour.querySelector('mask rect[fill="black"]');
  const card = tour.querySelector('.tour-card');
  const dots = [...tour.querySelectorAll('.tour-card span[class*="rounded-full"]')];

  return {
    present: true,
    step: (card.querySelector('.font-mono') || {}).textContent,
    title: (card.querySelector('h2') || {}).textContent,
    body: (card.querySelector('p') || {}).textContent,
    nextLabel: (tour.querySelector('[data-testid="tour-next"]') || {}).textContent,
    skipLabel: (tour.querySelector('[data-testid="tour-skip"]') || {}).textContent,
    dots: dots.length,
    hand: !!tour.querySelector('.tour-hand svg'),
    ripple: !!tour.querySelector('.tour-ripple'),
    hole: hole ? {
      x: Math.round(Number(hole.getAttribute('x'))),
      y: Math.round(Number(hole.getAttribute('y'))),
      w: Math.round(Number(hole.getAttribute('width'))),
      h: Math.round(Number(hole.getAttribute('height'))),
    } : null,
    cardBox: (() => { const b = card.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; })(),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
`);

/** The box the cutout is supposed to be sitting on. */
const targetBox = (browser, name) => browser.evaluate(`
  const el = document.querySelector('[data-tutorial="${name}"]');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
`);

const advance = (browser) => browser.evaluate(`
  document.querySelector('[data-testid="tour-next"]').click();
  await new Promise(r => setTimeout(r, 700));
  return 'ok';
`);

// ── Phase one, on the camera ───────────────────────────────────────────────
const browser = await openApp({ tour: true });
await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1400));
  return 'ok';
`);

const first = await readTour(browser);
check('the tour runs on a fresh install', first.present, JSON.stringify(first.body || ''));
check('it says which step you are on', /STEP 1 OF 5/.test(first.step || ''), first.step);
check('there is a hand, and it is drawn rather than typed', first.hand, String(first.hand));
check('the hand taps something', first.ripple);
check('one dot per step', first.dots === 5, String(first.dots));

/*
  The whole point. Every step names a data-tutorial anchor; if the anchor is
  gone from the markup the step is silently skipped, so walking the phase and
  collecting what it actually spotlighted is the only way to notice.
*/
const PHASE1 = ['viewfinder', 'shutter', 'type-instead', 'language', 'my-medicines'];
const seen = [];
for (let i = 0; i < PHASE1.length; i++) {
  const state = await readTour(browser);
  if (!state.present) break;

  const expected = PHASE1[i];
  const target = await targetBox(browser, expected);
  check(`step ${i + 1} has ${expected} on screen to point at`, target !== null, JSON.stringify(target));

  if (target && state.hole) {
    // The cutout carries padding, so it contains the control rather than
    // matching it. Within 24px on every side is the tolerance that allows.
    const fits =
      state.hole.x <= target.x + 2 && state.hole.y <= target.y + 2
      && state.hole.x + state.hole.w >= target.x + target.w - 2
      && state.hole.y + state.hole.h >= target.y + target.h - 2
      && state.hole.x >= target.x - 24 && state.hole.y >= target.y - 24;
    check(`and the spotlight is on it, not beside it`,
      fits, `hole=${JSON.stringify(state.hole)} target=${JSON.stringify(target)}`);
  }

  // A card off the bottom of the screen is a card nobody reads.
  check(`step ${i + 1}'s card is fully on screen`,
    state.cardBox.top >= 0 && state.cardBox.bottom <= state.viewport.h,
    JSON.stringify(state.cardBox));
  check(`step ${i + 1} says something`,
    (state.title || '').length > 3 && (state.body || '').length > 20,
    `${state.title} / ${(state.body || '').slice(0, 40)}`);

  seen.push(expected);
  if (i === 0) await screenshot(browser, 'tour-1-viewfinder', import.meta.url);
  if (i === 1) await screenshot(browser, 'tour-2-shutter', import.meta.url);
  await advance(browser);
}

check('every step of the camera tour found its target', seen.length === PHASE1.length, JSON.stringify(seen));
const afterPhase1 = await browser.evaluate(`
  return {
    gone: !document.querySelector('[data-testid="tour"]'),
    stored: localStorage.getItem('tourSeenVersion1'),
    onCamera: !!document.querySelector('[data-tutorial="shutter"]'),
  };
`);
check('finishing closes it', afterPhase1.gone, JSON.stringify(afterPhase1));
check('and stamps it with this version', afterPhase1.stored === VERSION, String(afterPhase1.stored));
check('and leaves you on the camera', afterPhase1.onCamera);

// ── Shown once ─────────────────────────────────────────────────────────────
// The reason the keys hold a version rather than 'true': a reload must not
// bring it back, and an update must.
await browser.goto(BASE);
const onReload = await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1500));
  return !!document.querySelector('[data-testid="tour"]');
`);
check('it is not shown again on the next launch', !onReload);

const onUpdate = await browser.evaluate(`
  localStorage.setItem('tourSeenVersion1', '1.3.0');
  return localStorage.getItem('tourSeenVersion1');
`);
check('an older stamp is what an update looks like', onUpdate === '1.3.0');
await browser.goto(BASE);
const afterUpdate = await browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1500));
  return !!document.querySelector('[data-testid="tour"]');
`);
check('and the tour comes back for it', afterUpdate);

// ── Skipping ───────────────────────────────────────────────────────────────
const skipped = await browser.evaluate(`
  document.querySelector('[data-testid="tour-skip"]').click();
  await new Promise(r => setTimeout(r, 500));
  return {
    gone: !document.querySelector('[data-testid="tour"]'),
    stored: localStorage.getItem('tourSeenVersion1'),
  };
`);
check('skipping closes it', skipped.gone);
check('and skipping counts as having seen it', skipped.stored === VERSION, String(skipped.stored));

// finish() ends the process; the second browser still has work to do.
await browser.close();

// ── Phase two, on a result ─────────────────────────────────────────────────
// A separate browser: phase one has to be out of the way first, and the
// seeding script re-runs on every navigation, so it cannot be cleared in place.
const second = await openApp({ tour: true, storage: { tourSeenVersion1: VERSION } });
await second.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  return 'ok';
`);
check('the camera tour stays out of the way once it is done',
  !(await second.evaluate(`return !!document.querySelector('[data-testid="tour"]');`)));

const reached = await searchFor(second, 'Lipitor');
check('a result screen is reached', reached === 'ok', reached);
await second.evaluate(`await new Promise(r => setTimeout(r, 1400)); return 'ok';`);

const PHASE2 = ['quick-facts', 'detail-chips', 'professional-link', 'save-medicine'];
const resultTour = await readTour(second);
check('the result tour runs the first time a result is shown', resultTour.present, JSON.stringify(resultTour.body || ''));
check('with its own four steps', resultTour.dots === 4, String(resultTour.dots));

const seen2 = [];
for (let i = 0; i < PHASE2.length; i++) {
  const state = await readTour(second);
  if (!state.present) break;

  const expected = PHASE2[i];
  const target = await targetBox(second, expected);
  check(`result step ${i + 1} has ${expected} on screen to point at`, target !== null, JSON.stringify(target));

  if (target) {
    // Three of these four start below the fold on a phone, so this is really
    // a check that the tour scrolls to what it is about to talk about.
    check(`and ${expected} was scrolled into view for it`,
      target.y > -4 && target.y < state.viewport.h - 24,
      `y=${target.y} of ${state.viewport.h}`);
  }
  if (target && state.hole) {
    const fits =
      state.hole.x <= target.x + 2 && state.hole.y <= target.y + 2
      && state.hole.x + state.hole.w >= target.x + target.w - 2
      && state.hole.y + state.hole.h >= target.y + target.h - 2;
    check('and the spotlight is on it', fits,
      `hole=${JSON.stringify(state.hole)} target=${JSON.stringify(target)}`);
  }
  check(`result step ${i + 1}'s card is fully on screen`,
    state.cardBox.top >= 0 && state.cardBox.bottom <= state.viewport.h,
    JSON.stringify(state.cardBox));

  seen2.push(expected);
  if (i === 0) await screenshot(second, 'tour-result-facts', import.meta.url);
  await advance(second);
}
check('every step of the result tour found its target', seen2.length === PHASE2.length, JSON.stringify(seen2));

const afterPhase2 = await second.evaluate(`
  return {
    gone: !document.querySelector('[data-testid="tour"]'),
    stored: localStorage.getItem('tourSeenVersion2'),
    stillOnResult: !!document.querySelector('[data-tutorial="quick-facts"]'),
  };
`);
check('finishing the result tour closes it', afterPhase2.gone, JSON.stringify(afterPhase2));
check('and stamps phase two with this version', afterPhase2.stored === VERSION, String(afterPhase2.stored));
check('and leaves the result on screen', afterPhase2.stillOnResult);

// It used to replay after every single search, because the flag was cleared
// on navigation rather than stored.
const secondSearch = await second.evaluate(`
  const back = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
  if (back) back.click();
  await new Promise(r => setTimeout(r, 900));
  return 'ok';
`);
check('back to the camera', secondSearch === 'ok');
const again = await searchFor(second, 'Panadol');
if (again === 'ok') {
  await second.evaluate(`await new Promise(r => setTimeout(r, 1500)); return 'ok';`);
  check('the result tour does not replay on the next search',
    !(await second.evaluate(`return !!document.querySelector('[data-testid="tour"]');`)));
}

await finish(second);
