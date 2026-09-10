// The search screen on the emulator, against the live backend.
//
// /api/suggest is not deployed yet, so the remote half is expected to come back
// empty here. That is exactly the case worth proving on a real device: the
// screen must stay useful when the type-ahead answers nothing at all.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

// Reload first, seed second. Writing in the same call as location.reload()
// means the harness's retry-on-context-destroyed can run the writes against the
// transient origin the WebView holds mid-navigation, and the loaded page never
// sees them.
await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const seeded = await wv.evaluate(`
  localStorage.setItem('disclaimerAccepted', 'true');
  localStorage.setItem('tutorial_version', '1.3.0');
  localStorage.setItem('tutorial_phase1_done', 'true');
  localStorage.setItem('tutorial_phase2_done', 'true');
  localStorage.setItem('app-language', 'en');
  localStorage.setItem('recentSearches', JSON.stringify(['Panadol Extra', 'Metformin']));
  localStorage.removeItem('myMedications');
  return localStorage.getItem('recentSearches');
`);
check('the device state was seeded', seeded === '["Panadol Extra","Metformin"]', String(seeded));

const opened = await wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 900));
  const input = document.querySelector('input[type="search"]');
  if (!input) return 'no input: ' + document.body.innerText.slice(0, 150);
  return {
    focused: document.activeElement === input,
    placeholder: input.placeholder,
    hint: /Point the camera at the box/.test(document.body.innerText),
    recents: [...document.querySelectorAll('button')].map(b => b.innerText.trim())
      .filter(t => t === 'Panadol Extra' || t === 'Metformin'),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    width: window.innerWidth,
  };
`);
check('the search screen opens on device', typeof opened === 'object', String(opened));

if (typeof opened === 'object') {
  check('the field takes focus so the keyboard opens', opened.focused);
  check('it says what to type', /name on the pack/i.test(opened.placeholder), opened.placeholder);
  check('the camera hint is there', opened.hint);
  check('recent searches are offered as chips', opened.recents.length === 2, JSON.stringify(opened.recents));
  check('nothing overflows at the device width', !opened.overflows, `${opened.width}px`);
}

// The type-ahead endpoint is not deployed; the screen must not depend on it.
const typed = await wv.evaluate(`
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'panad');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1600));
  const rows = [...document.querySelectorAll('[role="listbox"] button')].map(b => b.innerText.replace(/\\n/g, ' | '));
  const fallback = [...document.querySelectorAll('button')].find(b => /Search for/.test(b.innerText));
  return {
    rows,
    offersSearch: !!fallback,
    stillUsable: !!document.querySelector('input[type="search"]'),
    noErrorShown: !/error|failed|wrong/i.test(document.body.innerText),
  };
`);
check('a recent search still suggests with the endpoint absent',
  typed.rows.some((row) => /Panadol Extra/.test(row)), JSON.stringify(typed.rows));
check('and no error is shown for a type-ahead that answered nothing', typed.noErrorShown);
check('the screen stays usable', typed.stillUsable);

// A real lookup, against the live API.
const searched = await wv.evaluate(`
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Metformin 500mg');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="quick-facts"]')) {
      return {
        reached: true,
        brand: document.querySelector('h1').textContent.trim(),
        recents: JSON.parse(localStorage.getItem('recentSearches') || '[]'),
      };
    }
  }
  return { reached: false, text: document.body.innerText.slice(0, 200) };
`);
check('a typed search reaches a real answer on device', searched.reached, JSON.stringify(searched).slice(0, 200));
if (searched.reached) {
  check('and the medicine is named', Boolean(searched.brand), searched.brand);
  check('and the search is remembered for next time',
    searched.recents[0] === 'Metformin 500mg', JSON.stringify(searched.recents));
}

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
