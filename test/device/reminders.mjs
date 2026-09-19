// The reminders, on a real Android.
//
// This can only be a device suite, and not only because a browser has no
// notification service: what is being tested is whether Android actually holds
// the alarms and delivers them. Scheduling something is easy; the question is
// whether it survives the trip through the platform.
//
// Two halves. First, that the app's saved times turn into pending alarms with
// the right count and the right wording, read back out of Android with
// `adb shell dumpsys notification`. Second, that one genuinely arrives — a
// reminder is set a few seconds ahead and the notification shade is checked
// for it.
import { execSync } from 'node:child_process';
import { APP_VERSION, connectWebView } from './_webview.mjs';

const APP_ID = 'com.danehab.medicationidentifier';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const shell = (command) => {
  try {
    return execSync(`adb shell ${command}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return '';
  }
};

/** What Android is actually holding, as opposed to what the app believes. */
const postedNotifications = () => {
  const dump = shell('dumpsys notification --noredact');
  const ours = dump.split(/\r?\n/).filter((line) => line.includes(APP_ID));
  return { count: ours.length, lines: ours.slice(0, 4) };
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
  await wv.evaluate(`await new Promise(r => setTimeout(r, 1500)); return 'ok';`).catch(() => {});
};

// ── A phone with two medicines and four times between them ────────────────
const med = (name, times) => ({
  drugInfo: {
    drugName: name, brandName: name, canonicalName: '', strength: '',
    commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [],
  },
  language: 'en',
  originalName: name,
  savedAt: new Date().toISOString(),
  profileId: 'me',
  schedule: { times, note: '' },
});

await wv.evaluate(`
  localStorage.setItem('disclaimerAcceptedVersion', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion1', '${APP_VERSION}');
  localStorage.setItem('tourSeenVersion2', '${APP_VERSION}');
  localStorage.setItem('app-language', 'en');
  localStorage.setItem('profiles', JSON.stringify([{ id: 'me', name: 'Me' }, { id: 'pmum', name: 'Mum' }]));
  localStorage.setItem('activeProfile', 'me');
  localStorage.setItem('myMedications', JSON.stringify(${JSON.stringify([])}));
  return 'cleared';
`).catch(() => {});

// The permission has to be granted before any of this means anything. Granting
// it with adb rather than tapping the system dialog, which is not the app's.
shell(`pm grant ${APP_ID} android.permission.POST_NOTIFICATIONS`);

const seeded = JSON.stringify([
  med('Lipitor', ['08:00', '20:00']),
  med('Metformin', ['09:30']),
  { ...med('Ventolin', ['07:15']), profileId: 'pmum' },
]);

await wv.evaluate(`
  localStorage.setItem('myMedications', ${JSON.stringify(seeded)});
  location.reload();
`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
await pastIntro();

// The app rebuilds its reminders on launch, so by now they should be set.
const state = await wv.evaluate(`
  await new Promise(r => setTimeout(r, 2500));
  document.querySelector('[data-testid="open-settings"]').click();
  await new Promise(r => setTimeout(r, 900));
  const line = document.querySelector('[data-testid="reminder-state"]');
  return { text: line ? line.textContent.trim() : null };
`);
check('the settings screen reports on reminders', state.text !== null, String(state.text));
// Four times across three medicines, two people.
check('and counts every time that was saved', /\b4\b/.test(state.text || ''), state.text);

/*
  Read back out of Android rather than out of the app.

  The app knowing it asked for four alarms proves nothing; the platform is
  where they either exist or do not. getPending goes through the plugin to
  Android's own store, so this is the platform's answer.
*/
const pending = await wv.evaluate(`
  const { LocalNotifications } = window.Capacitor.Plugins;
  const result = await LocalNotifications.getPending();
  return {
    count: result.notifications.length,
    titles: result.notifications.map(n => n.title).sort(),
    ids: result.notifications.map(n => n.id),
  };
`);
check('Android is holding one alarm per saved time', pending.count === 4, String(pending.count));
check('each names the medicine it is for',
  pending.titles.filter((t) => /Lipitor/.test(t)).length === 2
  && pending.titles.some((t) => /Metformin/.test(t))
  && pending.titles.some((t) => /Ventolin/.test(t)),
  JSON.stringify(pending.titles));
// Two alarms for the same medicine at different times must not share an id,
// or one silently replaces the other.
check('and no two share an id', new Set(pending.ids).size === pending.ids.length,
  JSON.stringify(pending.ids));

// ── Removing a time removes its alarm ─────────────────────────────────────
const afterRemoval = await wv.evaluate(`
  const saved = JSON.parse(localStorage.getItem('myMedications'));
  saved[0].schedule.times = ['08:00'];
  localStorage.setItem('myMedications', JSON.stringify(saved));
  location.reload();
  return 'ok';
`).catch(() => 'ok');
await new Promise((r) => setTimeout(r, 6000));
await pastIntro();

const rebuilt = await wv.evaluate(`
  await new Promise(r => setTimeout(r, 2500));
  const { LocalNotifications } = window.Capacitor.Plugins;
  const result = await LocalNotifications.getPending();
  return { count: result.notifications.length, titles: result.notifications.map(n => n.title) };
`);
check('dropping a time drops its alarm', rebuilt.count === 3,
  `${rebuilt.count}: ${JSON.stringify(rebuilt.titles)}`);

// ── And one actually arrives ──────────────────────────────────────────────
//
// Everything above is bookkeeping. This is the only check that answers the
// question somebody setting a reminder is really asking.
const before = postedNotifications();

/*
  Scheduled the way the app schedules, not the way that is easy to test.

  This check used to use `schedule: { at }` — a one-shot at a moment — and
  passed, while the app uses `schedule: { on: { hour, minute } }` for a daily
  time. So the thing proven to arrive was not the thing being shipped. The
  minute has to be the next one to tick over, because `on` matches an hour and
  a minute and the seconds come from whenever it was scheduled.
*/
const fired = await wv.evaluate(`
  const { LocalNotifications } = window.Capacitor.Plugins;
  const when = new Date(Date.now() + 65000);
  await LocalNotifications.schedule({
    notifications: [{
      id: 999001,
      title: 'Time for Lipitor',
      body: 'Your reminder for this time.',
      schedule: { on: { hour: when.getHours(), minute: when.getMinutes() }, allowWhileIdle: true },
      // An exact alarm without the permission opens the system settings screen
      // and waits there, so the call never returns. The app says so too.
      isExactNotification: false,
      channelId: 'medication-reminders-v1',
    }],
  });
  return when.toTimeString().slice(0, 8);
`);

/*
  Inexact alarms come with a delivery window — about ninety seconds on this
  emulator, longer on a dozing phone — so the wait has to cover the window and
  not just the target. Waiting only to the target is how this looked broken.
*/
await new Promise((r) => setTimeout(r, 160000));
const after = postedNotifications();

check('a reminder scheduled the way the app schedules actually arrives',
  after.count > before.count,
  `${before.count} -> ${after.count} lines mentioning the app (due ${fired})`);

/*
  And arrives loudly enough to be noticed.

  Android decides that from the channel, not the notification, and the plugin's
  own "default" channel is IMPORTANCE_DEFAULT: it lands silently in the shade
  with no banner. For "take your tablet" that is indistinguishable from never
  arriving — which is exactly what it was reported as.
*/
const posted = shell('dumpsys notification --noredact')
  .split(/\r?\n/)
  .find((line) => line.includes('NotificationRecord') && line.includes(APP_ID)) || '';
check('on the reminders channel', /channel=medication-reminders-v1/.test(posted),
  posted.slice(0, 140));
check('at an importance that makes a sound', /importance=4/.test(posted),
  (posted.match(/importance=\d/) || ['none'])[0]);

// Leave nothing behind for the next suite.
await wv.evaluate(`
  const { LocalNotifications } = window.Capacitor.Plugins;
  await LocalNotifications.cancel({ notifications: [{ id: 999001 }] });
  await LocalNotifications.removeAllDeliveredNotifications();
  localStorage.removeItem('myMedications');
  return 'clean';
`).catch(() => {});

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
