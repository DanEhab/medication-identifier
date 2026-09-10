// Not a medicine, on the emulator, against the live API. Nothing is stubbed:
// what the real model says about a real non-medicine is the thing under test.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

await wv.evaluate(`
  localStorage.setItem('disclaimerAccepted', 'true');
  localStorage.setItem('tutorial_version', '1.3.0');
  localStorage.setItem('tutorial_phase1_done', 'true');
  localStorage.setItem('tutorial_phase2_done', 'true');
  localStorage.setItem('app-language', 'en');
  return 'seeded';
`);

const search = (term) => wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (/not a medicine|could not read/i.test(document.body.innerText)) return 'notAMedicine';
    if (document.querySelector('[data-tutorial="detail-chips"]')) return 'medicine';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);

// A flavoured drink is the case the design uses, and a real one to ask about.
const result = await search('vitamin water');
check('the live model refuses a flavoured drink', result === 'notAMedicine', String(result));

if (result === 'notAMedicine') {
  const screen = await wv.evaluate(`
    const text = document.body.innerText;
    const h1 = document.querySelector('h1');
    return {
      title: h1.textContent.trim(),
      titleSize: getComputedStyle(h1).fontSize,
      body: h1.nextElementSibling.innerText,
      pharmacistLine: /a question for a pharmacist, not a camera/.test(text),
      buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean),
      looksLikeAnswer: !!document.querySelector('[data-tutorial="quick-facts"], [data-tutorial="detail-chips"], [data-tutorial="save-medicine"]'),
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      width: window.innerWidth,
    };
  `);
  console.log('   the model said:', JSON.stringify(screen.body));
  check('the headline is the 32px one from the design', screen.titleSize === '32px', `${screen.title} @${screen.titleSize}`);
  check('it quotes what was searched', /vitamin water/i.test(screen.body), screen.body);
  check('the pharmacist line is there', screen.pharmacistLine);
  check('nothing on it can be skimmed as a drug page', !screen.looksLikeAnswer);
  check('both ways forward plus the correction are offered', screen.buttons.length === 3, JSON.stringify(screen.buttons));
  check('nothing overflows at the device width', !screen.overflows, `${screen.width}px`);

  // Insisting on something that really is not a medicine must not invent one.
  const insisted = await wv.evaluate(`
    [...document.querySelectorAll('button')].find(b => /We got it wrong/.test(b.innerText)).click();
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (document.querySelector('[data-tutorial="detail-chips"]')) return { invented: true, brand: document.querySelector('h1').textContent };
      if (/asked again and still could not find/i.test(document.body.innerText)) return { invented: false, saidSo: true };
      if (/not a medicine|could not read/i.test(document.body.innerText) && !document.querySelector('input[type="search"]')) {
        await new Promise(r => setTimeout(r, 800));
        if (/asked again and still could not find/i.test(document.body.innerText)) return { invented: false, saidSo: true };
      }
    }
    return { invented: false, saidSo: false, text: document.body.innerText.slice(0, 200) };
  `);
  check('insisting does not make the model invent a medicine', !insisted.invented, JSON.stringify(insisted).slice(0, 200));
  check('and the second refusal is said out loud', insisted.saidSo, JSON.stringify(insisted).slice(0, 200));
}

// A real medicine must still come through untouched.
await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
const real = await search('Panadol Extra');
check('a real medicine is still recognised', real === 'medicine', String(real));

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
