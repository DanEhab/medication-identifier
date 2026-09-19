// Does an existing user keep their medicines when the update lands?
//
// This app is published. The people on it have saved medicines, the people
// those medicines belong to, reminder times and notes, and a chosen language
// and theme — all of it in the WebView's own storage, none of it on a server.
// If an update wiped that it would be unrecoverable, and it would be
// discovered by the users rather than by us.
//
// Android preserves an app's data across an `adb install -r`, and across a
// Play Store update, so this should always pass. It is here because "should
// always pass" is exactly the assumption worth having a check for: a change to
// the storage keys, a migration that throws, or a rename in medicationStorage
// would all break it silently and only for people who already have the app —
// never for us, because we install clean.
//
// Usage, around the install:
//
//   bash test/device/relaunch.sh
//   node tools/upgradeCheck.mjs write
//   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
//   bash test/device/relaunch.sh
//   node tools/upgradeCheck.mjs read
//
// It writes a probe into storage, so run it before the device suite rather
// than after, and it clears up after itself on `read`.
import { fileURLToPath, pathToFileURL } from 'node:url';

const { connectWebView } = await import(
  pathToFileURL(fileURLToPath(new URL('../test/device/_webview.mjs', import.meta.url))).href
);

const mode = process.argv[2];
if (mode !== 'write' && mode !== 'read') {
  console.error('usage: node tools/upgradeCheck.mjs write|read');
  process.exit(2);
}

const wv = await connectWebView();

if (mode === 'write') {
  await wv.evaluate(`
    localStorage.setItem('myMedications', JSON.stringify([{
      drugInfo: { drugName: 'Upgrade Probe 500mg', whatItIsFor: 'Proving the update kept it.' },
      language: 'en',
      originalName: 'Upgrade Probe',
      savedAt: ${JSON.stringify(new Date().toISOString())},
      profileId: 'probe-person',
      schedule: { times: ['09:30', '21:00'], note: 'after dinner' }
    }]));
    localStorage.setItem('profiles', JSON.stringify([{ id: 'probe-person', name: 'Probe Person' }]));
    localStorage.setItem('activeProfile', 'probe-person');
    localStorage.setItem('app-language', 'ar');
    localStorage.setItem('app-theme', 'dark');
    return 'written';
  `);
  console.log('probe written — now install the new build over this one and run `read`');
  process.exit(0);
}

const state = JSON.parse(await wv.evaluate(`
  const meds = JSON.parse(localStorage.getItem('myMedications') || '[]');
  const profiles = JSON.parse(localStorage.getItem('profiles') || '[]');
  return JSON.stringify({
    medicines: meds.length,
    probeName: ((meds[0] || {}).drugInfo || {}).drugName || null,
    times: ((meds[0] || {}).schedule || {}).times || [],
    note: ((meds[0] || {}).schedule || {}).note || null,
    profileNames: profiles.map((p) => p.name),
    activeProfile: localStorage.getItem('activeProfile'),
    language: localStorage.getItem('app-language'),
    theme: localStorage.getItem('app-theme'),
    tourStamp: localStorage.getItem('tourSeenVersion1'),
    disclaimerStamp: localStorage.getItem('disclaimerAcceptedVersion'),
  });
`));

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

check('the saved medicine survived the update', state.medicines === 1, `${state.medicines} saved`);
check('with its name intact', state.probeName === 'Upgrade Probe 500mg', String(state.probeName));
check('the reminder times survived', state.times.join(',') === '09:30,21:00', state.times.join(',') || 'none');
check('and the note with them', state.note === 'after dinner', String(state.note));
check('the person it belongs to survived', state.profileNames.join(',') === 'Probe Person', state.profileNames.join(',') || 'none');
check('and is still the active one', state.activeProfile === 'probe-person', String(state.activeProfile));
check('the chosen language survived', state.language === 'ar', String(state.language));
check('the chosen theme survived', state.theme === 'dark', String(state.theme));

// Not a failure. Both are stamped with the version that dismissed them, so a
// new version is meant to offer them again — printed so that a release which
// unexpectedly did *not* re-offer them is visible here too.
console.log(`note  tour stamp ${state.tourStamp}, disclaimer stamp ${state.disclaimerStamp} — both are meant to reset on a new version`);

await wv.evaluate(`
  ['myMedications', 'profiles', 'activeProfile', 'app-theme'].forEach((k) => localStorage.removeItem(k));
  localStorage.setItem('app-language', 'en');
  return 'cleared';
`);
console.log('probe cleared');

console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
