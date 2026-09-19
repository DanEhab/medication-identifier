// The tour on the emulator.
//
// The browser suite already proves the steps point at the right things. What
// only a device can answer is whether the spotlight lands on a *camera*: the
// browser has no camera, so the viewfinder there is a placeholder of a known
// size, and the real preview resizes itself as the stream starts. A spotlight
// measured before that settles ends up around a box that is no longer there.
//
// It also checks the two things that are properties of the WebView rather than
// of the code: that the hand is really animating, and that the card is legible
// against a live camera picture in both themes.
import { APP_VERSION, connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const VERSION = APP_VERSION;
const wv = await connectWebView();

/*
  Waits out the intro clip rather than assuming a duration.

  Dispatching 'ended' at a fixed delay is what a browser suite can get away
  with. On the emulator the clip sometimes has not loaded by then, so the
  event lands on nothing and the splash is still up — and the tour is gated
  behind the splash, so it reads as a tour that never ran. Polling the splash
  itself, and dismissing it the way a finger would, removes the guess.
*/
const pastIntro = async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const gone = await wv.evaluate(`
      const splash = document.querySelector('[aria-label="Skip introduction"]');
      if (!splash) return true;
      splash.click();
      await new Promise(r => setTimeout(r, 400));
      return !document.querySelector('[aria-label="Skip introduction"]');
    `).catch(() => false);
    if (gone) break;
  }
  // The camera preview arrives at its real size a beat after the element does,
  // and measuring before it settles is the whole reason this suite is on a
  // device rather than in a headless browser.
  await wv.evaluate(`await new Promise(r => setTimeout(r, 2500)); return 'ok';`);
};

/** A fresh install, minus the disclaimer, which has its own suite. */
const freshInstall = async (language) => {
  await wv.evaluate(`
    localStorage.setItem('disclaimerAcceptedVersion', '${VERSION}');
    localStorage.removeItem('tourSeenVersion1');
    localStorage.removeItem('tourSeenVersion2');
    localStorage.setItem('app-language', '${language}');
    localStorage.removeItem('myMedications');
    location.reload();
  `).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));
  await pastIntro();
};

const readStep = () => wv.evaluate(`
  const tour = document.querySelector('[data-testid="tour"]');
  if (!tour) return { present: false, body: document.body.innerText.slice(0, 160) };
  const hole = tour.querySelector('mask rect[fill="black"]');
  const card = tour.querySelector('.tour-card');
  const cb = card.getBoundingClientRect();
  return {
    present: true,
    step: (card.querySelector('.font-mono') || {}).textContent,
    title: (card.querySelector('h2') || {}).textContent,
    hole: hole ? {
      x: Math.round(Number(hole.getAttribute('x'))),
      y: Math.round(Number(hole.getAttribute('y'))),
      w: Math.round(Number(hole.getAttribute('width'))),
      h: Math.round(Number(hole.getAttribute('height'))),
    } : null,
    card: { top: Math.round(cb.top), bottom: Math.round(cb.bottom), left: Math.round(cb.left), right: Math.round(cb.right) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
`);

const boxOf = (name) => wv.evaluate(`
  const el = document.querySelector('[data-tutorial="${name}"]');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
`);

const advance = () => wv.evaluate(`
  document.querySelector('[data-testid="tour-next"]').click();
  await new Promise(r => setTimeout(r, 800));
  return 'ok';
`);

const walk = async (label, targets) => {
  const found = [];
  for (let i = 0; i < targets.length; i++) {
    const state = await readStep();
    if (!state.present) break;
    const want = targets[i];
    const box = await boxOf(want);
    check(`${label}: step ${i + 1} has ${want} to point at`, box !== null, JSON.stringify(box));
    if (box && state.hole) {
      const covers =
        state.hole.x <= box.x + 2 && state.hole.y <= box.y + 2
        && state.hole.x + state.hole.w >= box.x + box.w - 2
        && state.hole.y + state.hole.h >= box.y + box.h - 2;
      check(`${label}: and the cutout is around it`, covers,
        `hole=${JSON.stringify(state.hole)} target=${JSON.stringify(box)}`);
    }
    check(`${label}: step ${i + 1}'s card is on screen`,
      state.card.top >= 0 && state.card.bottom <= state.viewport.h, JSON.stringify(state.card));
    found.push(want);
    await advance();
  }
  check(`${label}: every step found its target`, found.length === targets.length, JSON.stringify(found));
};

const PHASE1 = ['viewfinder', 'shutter', 'type-instead', 'language', 'my-medicines'];

// ── English, on the real camera ────────────────────────────────────────────
await freshInstall('en');
const opening = await readStep();
check('the tour runs on a fresh install', opening.present, JSON.stringify(opening.body || ''));
check('starting at step one of five', /STEP 1 OF 5/.test(opening.step || ''), opening.step);

/*
  The viewfinder on a device is a live <video>, which arrives at its real size
  a beat after the element does. This is the case the browser cannot reproduce.
*/
const viewfinder = await boxOf('viewfinder');
check('the viewfinder has settled at a real size',
  viewfinder !== null && viewfinder.w > 200 && viewfinder.h > 200, JSON.stringify(viewfinder));
if (viewfinder && opening.hole) {
  check('and the spotlight is around the settled preview, not where it started',
    opening.hole.w >= viewfinder.w && opening.hole.h >= viewfinder.h
      && opening.hole.w < viewfinder.w + 60 && opening.hole.h < viewfinder.h + 60,
    `hole=${opening.hole.w}x${opening.hole.h} preview=${viewfinder.w}x${viewfinder.h}`);
}

/*
  The hand is a CSS animation, and a CSS animation that never got applied looks
  exactly like one that did in every static measurement. getAnimations is the
  thing that tells them apart.
*/
const motion = await wv.evaluate(`
  const hand = document.querySelector('.tour-hand');
  const ripple = document.querySelector('.tour-ripple');
  const halo = document.querySelector('.tour-halo');
  const running = (el) => el ? el.getAnimations().map(a => ({ name: a.animationName, state: a.playState })) : [];
  /*
    Sampled across a whole cycle rather than twice.

    The hand rests for most of its 2.4s: it taps in a window of about 400ms
    and sits still either side, which is what makes it read as a gesture
    rather than a wobble. Two readings half a second apart therefore land on
    the same resting transform most of the time, and a test that concluded
    'not animating' from that would be measuring the easing, not the bug.
  */
  const frames = [];
  for (let i = 0; i < 16; i++) {
    frames.push(getComputedStyle(hand).transform);
    await new Promise(r => setTimeout(r, 180));
  }
  return {
    hand: running(hand), ripple: running(ripple), halo: running(halo),
    distinct: [...new Set(frames)].length,
    // Drawn, whatever it is drawn out of: it was one path and is now a
    // silhouette built from rects, because the path's knuckle arcs were
    // separate subpaths and the stroke drew them across the filled shape.
    handSvg: (() => {
      const svg = document.querySelector('.tour-hand svg');
      return !!svg && svg.querySelectorAll('path, rect, circle').length > 0;
    })(),
  };
`);
check('the hand is drawn, not an emoji', motion.handSvg);
check('the hand is actually animating on the device',
  motion.hand.some((a) => a.name === 'tour-tap' && a.state === 'running'), JSON.stringify(motion.hand));
check('and its transform really moves over a cycle', motion.distinct > 1, `${motion.distinct} distinct transforms in 2.9s`);
check('the tap ripple runs', motion.ripple.some((a) => a.state === 'running'), JSON.stringify(motion.ripple));
check('the halo breathes', motion.halo.some((a) => a.state === 'running'), JSON.stringify(motion.halo));

// The card sits over a live camera picture, which is the hardest ground to
// read on: anything can be behind it, so it has to bring its own.
const cardGround = await wv.evaluate(`
  const card = document.querySelector('.tour-card');
  const s = getComputedStyle(card);
  const m = s.backgroundColor.match(/rgba?\\(([^)]+)\\)/);
  const p = m ? m[1].split(',').map(Number) : [];
  return { bg: s.backgroundColor, opaque: p.length < 4 || p[3] === 1, shadow: s.boxShadow !== 'none' };
`);
check('the card is fully opaque over the camera', cardGround.opaque, cardGround.bg);
check('and lifted off it with a shadow', cardGround.shadow);

await walk('en', PHASE1);

const done = await wv.evaluate(`
  return {
    gone: !document.querySelector('[data-testid="tour"]'),
    stored: localStorage.getItem('tourSeenVersion1'),
    camera: !!document.querySelector('[data-tutorial="shutter"]'),
  };
`);
check('finishing closes it and leaves the camera', done.gone && done.camera, JSON.stringify(done));
check('and stamps this version', done.stored === VERSION, String(done.stored));

// ── Once per version, across a real app restart ────────────────────────────
await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 5000));
await pastIntro();
const relaunch = await wv.evaluate(`return !!document.querySelector('[data-testid="tour"]');`);
check('it does not come back on the next launch', !relaunch);

await wv.evaluate(`localStorage.setItem('tourSeenVersion1', '1.3.0'); location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 5000));
await pastIntro();
const afterUpdate = await wv.evaluate(`return !!document.querySelector('[data-testid="tour"]');`);
check('but it does come back after an update', afterUpdate);

// ── Arabic, where the hand has to come from the other side ─────────────────
await freshInstall('ar');
const arabic = await wv.evaluate(`
  const tour = document.querySelector('[data-testid="tour"]');
  if (!tour) return { present: false, body: document.body.innerText.slice(0, 140) };
  const card = tour.querySelector('.tour-card');
  const hand = tour.querySelector('.tour-hand').closest('div[style]').parentElement;
  const target = document.querySelector('[data-tutorial="viewfinder"]').getBoundingClientRect();
  const handBox = tour.querySelector('.tour-hand').getBoundingClientRect();
  return {
    present: true,
    dir: document.documentElement.getAttribute('dir'),
    title: (card.querySelector('h2') || {}).textContent,
    step: (card.querySelector('.font-mono') || {}).textContent,
    next: (tour.querySelector('[data-testid="tour-next"]') || {}).textContent,
    handCentre: Math.round(handBox.left + handBox.width / 2),
    targetCentre: Math.round(target.left + target.width / 2),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the tour runs in Arabic too', arabic.present, JSON.stringify(arabic.body || ''));
check('the page is right to left', arabic.dir === 'rtl', String(arabic.dir));
check('and the tour speaks Arabic', /[؀-ۿ]/.test(arabic.title || ''), arabic.title);
check('including its step counter and button',
  /[؀-ۿ]/.test(arabic.step || '') && /[؀-ۿ]/.test(arabic.next || ''),
  `${arabic.step} / ${arabic.next}`);
// A right hand entering from the right of a right-to-left screen puts the arm
// across the thing it is pointing at, so it comes in from the left instead.
check('the hand comes in from the left in Arabic',
  arabic.handCentre < arabic.targetCentre,
  `hand=${arabic.handCentre} target centre=${arabic.targetCentre}`);
check('nothing overflows sideways in Arabic', !arabic.overflows);

await walk('ar', PHASE1);

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
