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
import { openApp, check, finish, screenshot, searchFor, BASE, APP_VERSION } from './_harness.mjs';

const VERSION = APP_VERSION;

/*
  The screens this has to work on, the same spread the layout suite uses.

  A tour is placed from measurements, so it is only right for the sizes it was
  measured at — and the phone sizes are where it goes wrong, because that is
  where the card and the thing it describes compete for the same space.
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

/** What the rest of the suite runs at, restored after each sweep. */
const BASE_SIZE = { width: 428, height: 926 };

/**
 * One step, measured against everything that can go wrong with it.
 *
 * Gathered in a single evaluate so the numbers all describe the same moment —
 * reading them one at a time let the tour settle between reads and hid the
 * state that was actually on screen.
 */
const measureStep = (browser, target) => browser.evaluate(`
  const tour = document.querySelector('[data-testid="tour"]');
  if (!tour) return null;
  const hand = tour.querySelector('.tour-hand');
  const card = document.querySelector('.tour-card');
  const control = document.querySelector('[data-tutorial=' + ${JSON.stringify(JSON.stringify(target))} + ']');
  if (!hand || !card) return null;

  const h = hand.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const over = (a, b) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  return {
    handOnScreen: h.top >= 0 && h.left >= 0 && h.bottom <= innerHeight && h.right <= innerWidth,
    handUnderCard: over(h, c) / (h.width * h.height),
    controlBuried: control ? over(h, control.getBoundingClientRect())
      / (control.getBoundingClientRect().width * control.getBoundingClientRect().height) : 0,
    cardOnScreen: c.top >= 0 && c.bottom <= innerHeight,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    // A tour with its own words missing is a tour nobody can follow.
    hasTitle: !!(tour.querySelector('h2, h3') || {}).textContent,
    hand: { t: Math.round(h.top), l: Math.round(h.left) },
    viewport: [innerWidth, innerHeight],
  };
`);

/** Every way a step can be wrong, in one place so the message says which. */
const checkStep = (check, label, m) => {
  check(`${label}: the hand is on screen`, m && m.handOnScreen, JSON.stringify(m));
  check(`${label}: the hand is not under the card`, m && m.handUnderCard < 0.2,
    `${Math.round((m?.handUnderCard ?? 1) * 100)}%`);
  check(`${label}: the hand is not on top of the control`, m && m.controlBuried < 0.25,
    `${Math.round((m?.controlBuried ?? 1) * 100)}%`);
  check(`${label}: the card fits and nothing overflows`,
    m && m.cardOnScreen && !m.overflows, JSON.stringify(m));
  check(`${label}: the step has words`, m && m.hasTitle, JSON.stringify(m));
};

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

  /*
    The hand has to be somewhere it can be seen.

    It used to sit just under the control's lower corner on every step, which
    is exactly where the card goes for a control at the top of the screen, at
    the foot of it, or as large as the viewfinder. Three steps of five drew a
    hand entirely behind the card, and nothing noticed, because a hand that is
    rendered is a hand that is present as far as the DOM is concerned.
  */
  const hand = await browser.evaluate(`
    const h = document.querySelector('[data-testid="tour"] .tour-hand');
    const card = document.querySelector('.tour-card');
    if (!h) return null;
    const b = h.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const overlapW = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
    const overlapH = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
    return {
      box: { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) },
      onScreen: b.top >= 0 && b.left >= 0 && b.bottom <= window.innerHeight && b.right <= window.innerWidth,
      hiddenByCard: (overlapW * overlapH) / (b.width * b.height),
    };
  `);
  check(`step ${i + 1}'s hand is on screen`, hand && hand.onScreen, JSON.stringify(hand));
  check(`and not buried under the card`, hand && hand.hiddenByCard < 0.2,
    `${Math.round((hand?.hiddenByCard ?? 1) * 100)}% covered`);

  /*
    And not sitting on the control either.

    The hand is 44 by 50; the language button is 40 by 40. Any placement that
    lands on something that size hides it completely, which is the opposite of
    pointing at it — it was covering 77% of that button and 31% of the shutter.
    The card being clear of the hand says nothing about this: both were true at
    once.
  */
  const obstruction = await browser.evaluate(`
    const h = document.querySelector('[data-testid="tour"] .tour-hand');
    const target = document.querySelector('[data-tutorial=${JSON.stringify(PHASE1[i])}]');
    if (!h || !target) return null;
    const a = h.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const over = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return { covered: over / (b.width * b.height), size: [Math.round(b.width), Math.round(b.height)] };
  `);
  check(`and does not bury ${PHASE1[i]} itself`,
    obstruction && obstruction.covered < 0.25,
    `${Math.round((obstruction?.covered ?? 1) * 100)}% of ${JSON.stringify(obstruction?.size)}`);

  /*
    The card must not sit on the thing it is describing.

    It used to choose its side by asking only whether the space below was
    bigger than the card plus a margin, without checking that the space above
    was any better. On the viewfinder step that gap is within a few pixels of
    the threshold, and the Arabic card is nine pixels taller than the English
    one — enough to tip it. Arabic flipped the card to the top of the screen,
    where it did not fit either, so it clamped to the edge and covered the
    header and half the spotlight.
  */
  if (state.hole) {
    const overlap = Math.max(0, Math.min(state.cardBox.bottom, state.hole.y + state.hole.h) - Math.max(state.cardBox.top, state.hole.y))
      * Math.max(0, Math.min(state.cardBox.right, state.hole.x + state.hole.w) - Math.max(state.cardBox.left, state.hole.x));
    check(`and the card is clear of the spotlight`, overlap === 0,
      `card=${JSON.stringify(state.cardBox)} hole=${JSON.stringify(state.hole)}`);
  }
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

  /*
    And the hand, which this tour was never asked about.

    Phase one had the same bug found and fixed, and the checks that found it
    were only ever pointed at phase one — so the medicine page went on drawing
    its first step's hand underneath the card, where a wide target leaves
    nowhere on either side for it to go.
  */
  const hand2 = await second.evaluate(`
    const h = document.querySelector('[data-testid="tour"] .tour-hand');
    const card = document.querySelector('.tour-card');
    if (!h || !card) return null;
    const b = h.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const overlapW = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
    const overlapH = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
    return {
      box: { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) },
      onScreen: b.top >= 0 && b.left >= 0 && b.bottom <= window.innerHeight && b.right <= window.innerWidth,
      hiddenByCard: (overlapW * overlapH) / (b.width * b.height),
    };
  `);
  check(`result step ${i + 1}'s hand is on screen`, hand2 && hand2.onScreen, JSON.stringify(hand2));
  check(`and result step ${i + 1}'s hand is not buried under the card`,
    hand2 && hand2.hiddenByCard < 0.2,
    `${Math.round((hand2?.hiddenByCard ?? 1) * 100)}% covered`);

  /*
    The same step on every screen it might be read on.

    A placement is chosen from measurements, so it is only ever right for the
    measurements it was checked at. The step that failed here was fine on a
    tablet and buried on a phone. The tour re-measures on an animation frame,
    so the viewport can be changed underneath it and read back without
    starting the tour again.
  */
  for (const size of SIZES) {
    await second.setViewport(size.width, size.height);
    const atSize = await second.evaluate(`
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 260));
      const h = document.querySelector('[data-testid="tour"] .tour-hand');
      const card = document.querySelector('.tour-card');
      if (!h || !card) return null;
      const b = h.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const ow = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
      const oh = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
      const holeRect = document.querySelector('[data-testid="tour"] mask rect[fill="black"]');
      return {
        onScreen: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
        covered: (ow * oh) / (b.width * b.height),
        cardOnScreen: c.top >= 0 && c.bottom <= innerHeight,
        overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        // Printed so a failure says where things were, not just that it failed.
        hand: { t: Math.round(b.top), l: Math.round(b.left), b: Math.round(b.bottom), r: Math.round(b.right) },
        card: { t: Math.round(c.top), b: Math.round(c.bottom) },
        hole: holeRect ? {
          t: Math.round(+holeRect.getAttribute('y')), h: Math.round(+holeRect.getAttribute('height')),
        } : null,
        viewport: [innerWidth, innerHeight],
      };
    `);
    check(`result step ${i + 1} on ${size.name}: the hand is visible`,
      atSize && atSize.onScreen && atSize.covered < 0.2,
      JSON.stringify(atSize));
    check(`result step ${i + 1} on ${size.name}: the card fits and nothing overflows`,
      atSize && atSize.cardOnScreen && !atSize.overflows, JSON.stringify(atSize));
  }
  await second.setViewport(BASE_SIZE.width, BASE_SIZE.height);

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

// finish() ends the process, and Arabic still has to be walked.
await second.close();

// ── The same tour in Arabic ─────────────────────────────────────────
//
// Not a translation check — a layout one. The Arabic card is a few pixels
// taller than the English, which was enough to send the whole card to the
// other side of the screen on the viewfinder step, where it covered the
// header and half the spotlight. The English walk above would never have
// caught it, because in English the card fits.
const arabic = await openApp({ tour: true, language: 'ar' });
await arabic.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1500));
  return 'ok';
`);

const arabicSeen = [];
for (let i = 0; i < PHASE1.length; i++) {
  const state = await readTour(arabic);
  if (!state.present) break;
  arabicSeen.push(PHASE1[i]);

  check(`ar: step ${i + 1} is written in Arabic`, /[؀-ۿ]/.test(state.title || ''), state.title);
  check(`ar: step ${i + 1}'s card is fully on screen`,
    state.cardBox.top >= 0 && state.cardBox.bottom <= state.viewport.h, JSON.stringify(state.cardBox));

  if (state.hole) {
    const overlap = Math.max(0, Math.min(state.cardBox.bottom, state.hole.y + state.hole.h) - Math.max(state.cardBox.top, state.hole.y))
      * Math.max(0, Math.min(state.cardBox.right, state.hole.x + state.hole.w) - Math.max(state.cardBox.left, state.hole.x));
    check(`ar: and clear of the spotlight`, overlap === 0,
      `card=${JSON.stringify(state.cardBox)} hole=${JSON.stringify(state.hole)}`);
  }

  const hand = await arabic.evaluate(`
    const h = document.querySelector('[data-testid="tour"] .tour-hand');
    const c = document.querySelector('.tour-card');
    if (!h) return null;
    const b = h.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    const ow = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left));
    const oh = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
    return {
      onScreen: b.top >= 0 && b.left >= 0 && b.bottom <= window.innerHeight && b.right <= window.innerWidth,
      covered: (ow * oh) / (b.width * b.height),
    };
  `);
  check(`ar: step ${i + 1}'s hand is visible`, hand && hand.onScreen && hand.covered < 0.2,
    JSON.stringify(hand));

  if (i < PHASE1.length - 1) await advance(arabic);
}
check('ar: the whole tour runs', arabicSeen.length === PHASE1.length, JSON.stringify(arabicSeen));
check('ar: nothing overflows sideways',
  !(await arabic.evaluate(`return document.documentElement.scrollWidth > document.documentElement.clientWidth;`)));

await arabic.close();

/*
  ── The medicine page's tour, in Arabic, on every screen ──────────────────

  The camera tour was walked in Arabic and swept for size; the medicine page's
  was walked in neither. Its first step then shipped with the hand entirely
  behind the card, because the row it points at runs the full width of the
  screen and every placement that keeps clear of the card sits off the edge of
  it — a shape none of the camera tour's targets have.

  Arabic mirrors which side the hand comes in from and wraps the card to a
  different height, so it is a different layout, not the same one translated.
*/
const arabicResult = await openApp({
  tour: true, language: 'ar', storage: { tourSeenVersion1: VERSION },
});
await arabicResult.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  return 'ok';
`);

const arReached = await searchFor(arabicResult, 'Lipitor');
check('ar: a result screen is reached', arReached === 'ok', arReached);
await arabicResult.evaluate(`await new Promise(r => setTimeout(r, 1400)); return 'ok';`);

const arSeen2 = [];
for (let i = 0; i < PHASE2.length; i++) {
  const state = await readTour(arabicResult);
  if (!state.present) break;
  arSeen2.push(PHASE2[i]);

  check(`ar: result step ${i + 1} is written in Arabic`,
    /[؀-ۿ]/.test(state.title || ''), state.title);

  for (const size of SIZES) {
    await arabicResult.setViewport(size.width, size.height);
    const atSize = await arabicResult.evaluate(`
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 260));
      const h = document.querySelector('[data-testid="tour"] .tour-hand');
      const c = document.querySelector('.tour-card');
      if (!h || !c) return null;
      const b = h.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      const ow = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left));
      const oh = Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top));
      return {
        onScreen: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
        covered: (ow * oh) / (b.width * b.height),
        cardOnScreen: r.top >= 0 && r.bottom <= innerHeight,
        overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hand: { t: Math.round(b.top), l: Math.round(b.left), b: Math.round(b.bottom), r: Math.round(b.right) },
        viewport: [innerWidth, innerHeight],
      };
    `);
    check(`ar: result step ${i + 1} on ${size.name}: the hand is visible`,
      atSize && atSize.onScreen && atSize.covered < 0.2, JSON.stringify(atSize));
    check(`ar: result step ${i + 1} on ${size.name}: the card fits and nothing overflows`,
      atSize && atSize.cardOnScreen && !atSize.overflows, JSON.stringify(atSize));
  }
  await arabicResult.setViewport(BASE_SIZE.width, BASE_SIZE.height);

  if (i === 0) await screenshot(arabicResult, 'tour-result-facts-ar', import.meta.url);
  await advance(arabicResult);
}
check('ar: every step of the result tour found its target',
  arSeen2.length === PHASE2.length, JSON.stringify(arSeen2));

await arabicResult.close();

/*
  ── Both tours, both languages, both themes, every screen ─────────────────

  Each of those has broken something on its own: Arabic wrapped the card taller
  and tipped it to the wrong side of the spotlight; a full-width target left
  the hand nowhere to go but under the card; a small control at the edge of the
  screen had the hand dragged on top of it by a clamp. None of them was visible
  from the combination the suite happened to run at.

  Dark is in here because the hand is drawn from two theme colours, and a mark
  painted in the scrim's own colour is a mark nobody can see.
*/
for (const dark of [false, true]) {
  for (const lang of ['en', 'ar']) {
    const theme = dark ? 'dark' : 'light';

    // ── The camera tour ──
    const cam = await openApp({ tour: true, dark, language: lang });
    await cam.evaluate(`
      await new Promise(r => setTimeout(r, 2300));
      const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
      await new Promise(r => setTimeout(r, 1100));
      return 'ok';
    `);

    for (let i = 0; i < PHASE1.length; i++) {
      for (const size of SIZES) {
        await cam.setViewport(size.width, size.height);
        await cam.evaluate(`
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          // Longer than the hand's .34s position transition: measuring inside it
          // catches the hand in flight, which once reported it a sub-pixel past
          // the right edge on the narrowest screen.
          await new Promise(r => setTimeout(r, 420));
          return 'ok';
        `);
        checkStep(check, `${lang}/${theme} camera ${PHASE1[i]} on ${size.name}`,
          await measureStep(cam, PHASE1[i]));
      }
      await cam.setViewport(BASE_SIZE.width, BASE_SIZE.height);
      if (i < PHASE1.length - 1) await advance(cam);
    }
    await cam.close();

    // ── The medicine tour ──
    const med = await openApp({
      tour: true, dark, language: lang, storage: { tourSeenVersion1: VERSION },
    });
    await med.evaluate(`
      await new Promise(r => setTimeout(r, 2300));
      const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
      await new Promise(r => setTimeout(r, 900));
      return 'ok';
    `);
    const got = await searchFor(med, 'Lipitor');
    check(`${lang}/${theme}: a medicine is reached`, got === 'ok', got);
    await med.evaluate(`await new Promise(r => setTimeout(r, 1400)); return 'ok';`);

    for (let i = 0; i < PHASE2.length; i++) {
      for (const size of SIZES) {
        await med.setViewport(size.width, size.height);
        await med.evaluate(`
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          // Longer than the hand's .34s position transition: measuring inside it
          // catches the hand in flight, which once reported it a sub-pixel past
          // the right edge on the narrowest screen.
          await new Promise(r => setTimeout(r, 420));
          return 'ok';
        `);
        checkStep(check, `${lang}/${theme} medicine ${PHASE2[i]} on ${size.name}`,
          await measureStep(med, PHASE2[i]));
      }
      await med.setViewport(BASE_SIZE.width, BASE_SIZE.height);
      if (i < PHASE2.length - 1) await advance(med);
    }
    await med.close();
  }
}

/*
  ── The page underneath does not move ─────────────────────────────────────

  The scrim was assumed to swallow the gesture because it covers everything. It
  does not: a fixed overlay is painted over the page, not in the way of it, so
  a drag anywhere scrolled the medicine underneath and left the spotlight over
  whatever had taken its place.
*/
const locked = await openApp({ tour: true, storage: { tourSeenVersion1: VERSION } });
await locked.evaluate(`
  await new Promise(r => setTimeout(r, 2300));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 900));
  return 'ok';
`);
check('a medicine is reached for the scroll check', (await searchFor(locked, 'Lipitor')) === 'ok');
await locked.evaluate(`await new Promise(r => setTimeout(r, 1500)); return 'ok';`);

const gesture = await locked.evaluate(`
  const tour = document.querySelector('[data-testid="tour"]');
  if (!tour) return { noTour: true };
  const before = Math.round(window.scrollY);
  const wheel = new WheelEvent('wheel', { deltaY: 500, bubbles: true, cancelable: true });
  const wheelAllowed = tour.dispatchEvent(wheel);
  const touch = new Event('touchmove', { bubbles: true, cancelable: true });
  const touchAllowed = tour.dispatchEvent(touch);
  await new Promise(r => setTimeout(r, 400));
  return {
    wheelAllowed,
    touchAllowed,
    touchAction: getComputedStyle(tour).touchAction,
    moved: Math.round(window.scrollY) - before,
    scrollable: document.documentElement.scrollHeight > innerHeight + 4,
  };
`);
check('the page really could be scrolled, so the check means something',
  gesture.scrollable, JSON.stringify(gesture));
check('a wheel over the tour is refused', gesture.wheelAllowed === false, JSON.stringify(gesture));
check('and a drag is refused', gesture.touchAllowed === false, JSON.stringify(gesture));
check('and the browser is told not to scroll from it either',
  gesture.touchAction === 'none', String(gesture.touchAction));
check('so nothing moved underneath', gesture.moved === 0, String(gesture.moved));

/*
  ── A step change is one movement, not two ────────────────────────────────

  The page used to glide to the next target while the spotlight animated onto
  it and the card's words changed immediately — three motions that did not
  agree. Measured: four hundred milliseconds before anything lined up, against
  thirty for a step whose target was already on screen.
*/
const settle = await locked.evaluate(`
  const tour = () => document.querySelector('[data-testid="tour"]');
  const holeOf = () => {
    const r = document.querySelector('[data-testid="tour"] mask rect[fill="black"]');
    return r ? r.getAttribute('y') + 'x' + r.getAttribute('height') : null;
  };
  const t0 = performance.now();
  tour().querySelector('[data-testid="tour-next"]').click();
  let last = null, stableSince = null;
  for (let i = 0; i < 240; i++) {
    await new Promise(r => requestAnimationFrame(r));
    if (!tour()) break;
    const h = holeOf();
    if (h !== last) { last = h; stableSince = performance.now(); }
    else if (stableSince && performance.now() - stableSince > 250) {
      return { settledAfterMs: Math.round(stableSince - t0) };
    }
  }
  return { settledAfterMs: null };
`);
check('moving to the step below the fold settles quickly',
  settle.settledAfterMs !== null && settle.settledAfterMs < 150,
  `${settle.settledAfterMs}ms`);

await finish(locked);
