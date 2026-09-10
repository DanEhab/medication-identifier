// My medicines on the emulator, end to end: save a real medicine from a real
// lookup, find it in the list, schedule it, and navigate by the tab bar.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

// Reload first, seed second: writes in the same call as location.reload() can
// land on the transient origin the WebView holds mid-navigation.
await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const seeded = await wv.evaluate(`
  localStorage.setItem('disclaimerAccepted', 'true');
  localStorage.setItem('tutorial_version', '1.3.0');
  localStorage.setItem('tutorial_phase1_done', 'true');
  localStorage.setItem('tutorial_phase2_done', 'true');
  localStorage.setItem('app-language', 'en');
  localStorage.removeItem('myMedications');
  localStorage.removeItem('profiles');
  localStorage.removeItem('activeProfile');
  return 'seeded';
`);
check('the device state was reset', seeded === 'seeded', String(seeded));

// ── Look a real medicine up and save it ────────────────────────────────────
const saved = await wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || '')).click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Lipitor 20mg');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="save-medicine"]')) break;
  }
  const btn = document.querySelector('[data-tutorial="save-medicine"]');
  if (!btn) return { error: document.body.innerText.slice(0, 200) };
  btn.click();
  await new Promise(r => setTimeout(r, 600));
  const list = JSON.parse(localStorage.getItem('myMedications') || '[]');
  return {
    label: btn.innerText.trim(),
    names: list.map(m => m.drugInfo.brandName || m.drugInfo.drugName),
    profileIds: list.map(m => m.profileId),
    neverWith: list.map(m => m.drugInfo.neverWith),
  };
`);
check('a real medicine can be saved from its page', /Saved/i.test(saved.label || ''), JSON.stringify(saved).slice(0, 200));
check('and it belongs to the default person', saved.profileIds?.[0] === 'me', JSON.stringify(saved.profileIds));

// ── It is in the list, reached by the camera header ────────────────────────
const inList = await wv.evaluate(`
  const backBtn = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
  backBtn.click();
  await new Promise(r => setTimeout(r, 900));
  const meds = document.querySelector('[data-tutorial="my-medicines"]');
  if (!meds) return { error: 'no medicines button: ' + document.body.innerText.slice(0, 150) };
  meds.click();
  await new Promise(r => setTimeout(r, 900));
  const cards = [...document.querySelectorAll('[data-testid="medicine-list"] > div')];
  return {
    onList: !!document.querySelector('[data-tab="medicines"]'),
    cards: cards.map(c => c.innerText.replace(/\\n/g, ' | ')),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    width: window.innerWidth,
  };
`);
check('the camera header reaches the list on device', inList.onList, JSON.stringify(inList).slice(0, 160));
check('the saved medicine is in it', inList.cards?.length === 1, JSON.stringify(inList.cards));
check('nothing overflows at the device width', !inList.overflows, `${inList.width}px`);

// ── A time and a note ──────────────────────────────────────────────────────
const scheduled = await wv.evaluate(`
  const footer = [...document.querySelectorAll('[data-testid="medicine-list"] button')]
    .find(b => /Add when to take it/.test(b.innerText));
  if (!footer) return { error: 'no schedule row' };
  footer.click();
  await new Promise(r => setTimeout(r, 600));

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const time = document.querySelector('[role="dialog"] input[type="time"]');
  setter.call(time, '21:00');
  time.dispatchEvent(new Event('input', { bubbles: true }));
  time.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Add').click();
  await new Promise(r => setTimeout(r, 300));

  const note = [...document.querySelectorAll('[role="dialog"] input')].find(i => i.type !== 'time');
  setter.call(note, 'after dinner');
  note.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));
  [...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Save').click();
  await new Promise(r => setTimeout(r, 700));

  return {
    card: document.querySelector('[data-testid="medicine-list"] > div').innerText.replace(/\\n/g, ' | '),
    stored: JSON.parse(localStorage.getItem('myMedications'))[0].schedule,
  };
`);
check('a time and a note can be set on device',
  /21:00/.test(scheduled.card || '') && /after dinner/.test(scheduled.card || ''),
  JSON.stringify(scheduled).slice(0, 200));
check('and they persist', scheduled.stored?.times?.[0] === '21:00', JSON.stringify(scheduled.stored));

// ── A second person keeps their own list ───────────────────────────────────
const profiles = await wv.evaluate(`
  const plus = [...document.querySelectorAll('[data-testid="profiles"] button')].at(-1);
  plus.click();
  await new Promise(r => setTimeout(r, 400));
  const input = document.querySelector('[data-testid="profiles"] input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Mum');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 700));
  const emptyForMum = /Nothing saved/.test(document.body.innerText);
  const me = [...document.querySelectorAll('[data-testid="profiles"] button')].find(p => /Me/.test(p.innerText));
  me.click();
  await new Promise(r => setTimeout(r, 700));
  return {
    emptyForMum,
    backToMine: [...document.querySelectorAll('[data-testid="medicine-list"] > div')].length,
  };
`);
check("a second person starts with an empty list", profiles.emptyForMum);
check('and switching back shows the first list', profiles.backToMine === 1, String(profiles.backToMine));

// ── The tab bar ────────────────────────────────────────────────────────────
const tabs = await wv.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 800));
  const onSearch = !!document.querySelector('input[type="search"]');
  const backBtn = [...document.querySelectorAll('button')].find(b => /back/i.test(b.getAttribute('aria-label') || ''));
  backBtn.click();
  await new Promise(r => setTimeout(r, 800));
  const onCamera = !!document.querySelector('[data-tutorial="my-medicines"]');
  document.querySelector('[data-tutorial="my-medicines"]').click();
  await new Promise(r => setTimeout(r, 800));
  document.querySelector('[data-tab="scan"]').click();
  await new Promise(r => setTimeout(r, 900));
  return { onSearch, onCamera, backOnCamera: !!document.querySelector('[data-tutorial="my-medicines"]') };
`);
check('the search tab works on device', tabs.onSearch);
check('the scan tab returns to the camera', tabs.backOnCamera);

// ── The camera still works after all that navigation ───────────────────────
const camera = await wv.evaluate(`
  await new Promise(r => setTimeout(r, 1500));
  const video = document.querySelector('video');
  return {
    present: !!video,
    playing: video ? video.readyState >= 2 && video.videoWidth > 0 : false,
    state: video ? video.readyState : null,
  };
`);
check('the viewfinder is live again after leaving and returning',
  camera.present && camera.playing, JSON.stringify(camera));

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
