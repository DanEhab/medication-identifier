// The Arabic pass on the emulator, against the live API and the live
// translation service. Nothing is stubbed: the question this answers is
// whether somebody reading Arabic actually gets Arabic, not just Arabic chrome
// around English medical text.
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
  localStorage.setItem('app-language', 'ar');
  localStorage.removeItem('myMedications');
  return 'seeded';
`);

await wv.evaluate(`location.reload();`).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

const audit = (label) => wv.evaluate(`
  const arabic = /[\\u0600-\\u06FF]/;
  const problems = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim();
    if (!text || !arabic.test(text)) continue;
    const style = getComputedStyle(el);
    if (/mono/i.test(style.fontFamily)) problems.push('mono: ' + text.slice(0, 20));
    const spacing = parseFloat(style.letterSpacing);
    if (!Number.isNaN(spacing) && Math.abs(spacing) > 0.01) problems.push('tracking: ' + text.slice(0, 20));
  }
  return {
    dir: document.documentElement.dir,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    problems,
    width: window.innerWidth,
  };
`).then((r) => {
  check(`${label}: right to left on device`, r.dir === 'rtl', r.dir);
  check(`${label}: nothing overflows at ${r.width}px`, !r.overflows);
  check(`${label}: typography is set for Arabic`, r.problems.length === 0, r.problems.slice(0, 3).join(' | '));
});

// ── A real lookup, in Arabic, over the real network ───────────────────────
const looked = await wv.evaluate(`
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 1000));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /\\u0627\\u0643\\u062a\\u0628/.test(b.textContent || ''));
  if (!typeBtn) return 'no type button: ' + document.body.innerText.slice(0, 150);
  typeBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'Panadol Extra');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  input.form.requestSubmit();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (document.querySelector('[data-tutorial="detail-chips"]')) return 'ok';
  }
  return 'timed out: ' + document.body.innerText.slice(0, 200);
`);
check('an Arabic lookup reaches the result screen', looked === 'ok', String(looked));

// The whole point: is the medical text itself Arabic, or only the chrome?
const translated = await wv.evaluate(`
  const arabic = /[\\u0600-\\u06FF]/;
  const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
  const purpose = wash ? wash.innerText.split('\\n').slice(1).join(' ').trim() : '';
  const facts = [...document.querySelectorAll('[data-tutorial="quick-facts"] > div')].map(f => f.innerText.replace(/\\n/g, ' '));
  const howTo = (() => {
    const labels = [...document.querySelectorAll('.font-mono')];
    const label = labels.find(l => /\\u0637\\u0631\\u064a\\u0642\\u0629/.test(l.textContent));
    return label ? label.parentElement.innerText.replace(label.textContent, '').trim() : '';
  })();
  return {
    purpose,
    purposeIsArabic: arabic.test(purpose),
    howTo: howTo.slice(0, 90),
    howToIsArabic: arabic.test(howTo),
    facts,
    factsAreArabic: facts.some(f => arabic.test(f)),
  };
`);
console.log('   purpose:', JSON.stringify(translated.purpose).slice(0, 150));
console.log('   how to take:', JSON.stringify(translated.howTo));
console.log('   quick facts:', JSON.stringify(translated.facts));
check('the purpose sentence is actually in Arabic', translated.purposeIsArabic, translated.purpose.slice(0, 60));
check('how to take it is in Arabic', translated.howToIsArabic, translated.howTo);
check('the quick facts are in Arabic', translated.factsAreArabic, JSON.stringify(translated.facts));

await audit('result');

// ── The rest of the screens, on the device ────────────────────────────────
await wv.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('side effects');

const sideEffects = await wv.evaluate(`
  const arabic = /[\\u0600-\\u06FF]/;
  const bullets = [...document.querySelectorAll('span')].map(s => s.textContent.trim()).filter(Boolean);
  return { anyArabicBullet: bullets.some(b => b.length > 6 && arabic.test(b)) };
`);
check('the side effects themselves are in Arabic', sideEffects.anyArabicBullet);

await wv.evaluate(`
  [...document.querySelectorAll('button')].find(b => /back|\\u0639\\u0648\\u062f\\u0629/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="professional-link"]').click();
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-testid="clinical-card"]')) break;
  }
`);
await audit('professional');

await wv.evaluate(`
  document.querySelector('[data-testid="tab-plain"]').click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="save-medicine"]').click();
  await new Promise(r => setTimeout(r, 600));
  [...document.querySelectorAll('button')].find(b => /back|\\u0639\\u0648\\u062f\\u0629/i.test(b.getAttribute('aria-label') || '')).click();
  await new Promise(r => setTimeout(r, 900));
  document.querySelector('[data-tutorial="my-medicines"]').click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('my medicines');

await wv.evaluate(`
  document.querySelector('[data-tab="search"]').click();
  await new Promise(r => setTimeout(r, 900));
`);
await audit('search');

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
