// How fast the app actually is, on the device rather than on a desktop.
//
// A laptop running a headless Chrome says nothing useful about a phone: the
// budgets here are the ones a mid-range Android has to meet, and the numbers
// are read from the WebView's own performance timeline rather than timed from
// the outside, where the measurement includes adb and the test harness.
//
// The point is not to chase a score. It is to notice the two things that go
// wrong in an app like this without anyone seeing them: a screen that takes
// longer to appear than a person will wait, and a render loop that quietly
// runs for ever because a hook depends on something rebuilt every pass.
import { APP_VERSION, connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

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
};

await wv.evaluate(`
  localStorage.setItem('disclaimerAcceptedVersion', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion1', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion2', '${APP_VERSION}');
  localStorage.setItem('app-language', 'en');
  localStorage.removeItem('myMedications');
  location.reload();
`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
await pastIntro();

// ── Getting off the ground ────────────────────────────────────────────────
const startup = await wv.evaluate(`
  await new Promise(r => setTimeout(r, 1500));
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(
    performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)])
  );
  const resources = performance.getEntriesByType('resource');
  const byType = {};
  for (const r of resources) {
    const kind = /\\.js(\\?|$)/.test(r.name) ? 'js'
      : /\\.css(\\?|$)/.test(r.name) ? 'css'
      : /\\.(woff2?|ttf)(\\?|$)/.test(r.name) ? 'font'
      : /\\.(png|jpg|svg|webp)(\\?|$)/.test(r.name) ? 'image'
      : /\\.mp4(\\?|$)/.test(r.name) ? 'video' : 'other';
    byType[kind] = (byType[kind] || 0) + (r.transferSize || r.encodedBodySize || 0);
  }
  return {
    domInteractive: Math.round(nav.domInteractive),
    domComplete: Math.round(nav.domComplete),
    firstPaint: paints['first-paint'] ?? null,
    firstContentfulPaint: paints['first-contentful-paint'] ?? null,
    transferred: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])),
    resourceCount: resources.length,
  };
`);

console.log(`  startup: interactive ${startup.domInteractive}ms, first paint ${startup.firstPaint}ms, `
  + `contentful ${startup.firstContentfulPaint}ms`);
// Reported, not asserted: served from the APK, most of these read zero.
console.log(`  transferred (KB): ${JSON.stringify(startup.transferred)} across ${startup.resourceCount} requests`);

/*
  Two and a half seconds to interactive on an emulator, which is slower than
  most real phones. Past this the splash is covering an app that is not ready,
  which is the thing the splash exists to hide but not for this long.
*/
check('the app is interactive within 2.5s', startup.domInteractive < 2500, `${startup.domInteractive}ms`);
check('something is painted within 2s', (startup.firstContentfulPaint ?? 9999) < 2000,
  `${startup.firstContentfulPaint}ms`);
/*
  No bundle-size check here, deliberately.

  The obvious one — transferSize of the .js resources — reads 0 on a device,
  because the assets come out of the APK rather than off a network, and a
  check that always passes is worse than no check. The bundle is a property of
  the build, so it is budgeted in the unit layer against dist/ instead.
*/

// ── Moving between screens ────────────────────────────────────────────────
//
// Measured from the tap to the frame that shows the new screen, which is what
// the person waiting is actually measuring.
const navigation = await wv.evaluate(`
  const timeTab = async (tab, marker) => {
    const started = performance.now();
    document.querySelector('[data-tab="' + tab + '"]').click();
    for (let i = 0; i < 200; i++) {
      await new Promise(r => requestAnimationFrame(r));
      if (document.querySelector(marker)) return Math.round(performance.now() - started);
    }
    return -1;
  };
  const out = {};
  out.medicines = await timeTab('medicines', '[data-testid="profiles"]');
  out.scan = await timeTab('scan', '[data-tutorial="shutter"]');
  out.search = await timeTab('search', 'input[type="search"]');
  out.backToScan = await timeTab('scan', '[data-tutorial="shutter"]');
  return out;
`);
console.log(`  tab switches (ms): ${JSON.stringify(navigation)}`);
for (const [where, ms] of Object.entries(navigation)) {
  // 300ms is roughly where a transition stops feeling like a response to the
  // tap and starts feeling like waiting.
  check(`switching to ${where} is under 300ms`, ms >= 0 && ms < 300, `${ms}ms`);
}

// ── The thing that silently burns a battery ───────────────────────────────
/*
  A React app can settle into rendering every frame for ever — an effect
  depending on an object rebuilt each pass, a state write in a render. Nothing
  looks wrong; the phone just gets warm. Counting commits over a quiet second
  is how that shows up.
*/
const idle = await wv.evaluate(`
  /*
    Let the last tab switch finish first.

    Without this the window opens while the camera screen is still mounting —
    starting a media stream, measuring its frame — and catches the tail of that
    as a long task. It was reported intermittently at about 300ms, which is
    navigation work arriving late, not the main thread being held while nothing
    happens. Sitting on the camera for twelve seconds produces no long tasks at
    all, which is what said so.
  */
  await new Promise(r => setTimeout(r, 2000));

  let frames = 0;
  let longTasks = 0;
  let longest = 0;

  let observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks++;
        longest = Math.max(longest, Math.round(entry.duration));
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch { /* not supported in every WebView */ }

  const tick = () => { frames++; if (frames < 10000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  await new Promise(r => setTimeout(r, 3000));
  if (observer) observer.disconnect();

  return { frames, longTasks, longest, mutations: window.__mutationCount ?? null };
`);
console.log(`  idle: ${idle.frames} frames in 3s, ${idle.longTasks} long tasks (worst ${idle.longest}ms)`);
// The camera preview drives the frame loop, so frames are expected. Long tasks
// are not: they are the main thread being held away from the next touch.
check('nothing blocks the main thread for more than 200ms while idle',
  idle.longest < 200, `worst ${idle.longest}ms across ${idle.longTasks}`);

/*
  And the DOM should be still. The tour polls a rectangle on a frame while it
  is open, but it is not open here — with the camera simply running, an app
  rewriting its own DOM sixty times a second is a bug wearing a preview as a
  disguise.
*/
const churn = await wv.evaluate(`
  let mutations = 0;
  const observer = new MutationObserver((records) => { mutations += records.length; });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  await new Promise(r => setTimeout(r, 3000));
  observer.disconnect();
  return mutations;
`);
console.log(`  DOM changes while sitting on the camera: ${churn} in 3s`);
check('the camera screen is not rewriting itself while nothing happens',
  churn < 90, `${churn} mutations in 3s`);

// ── Memory, which is what kills an app on a cheap phone ───────────────────
const memory = await wv.evaluate(`
  const m = performance.memory;
  if (!m) return null;
  return { usedMB: Math.round(m.usedJSHeapSize / 1048576), limitMB: Math.round(m.jsHeapSizeLimit / 1048576) };
`);
if (memory) {
  console.log(`  JS heap: ${memory.usedMB}MB of ${memory.limitMB}MB`);
  check('the JavaScript heap stays modest', memory.usedMB < 80, `${memory.usedMB}MB`);
} else {
  console.log('  JS heap: not reported by this WebView');
}

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
