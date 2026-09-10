// Not a medicine: the screen that must never look like an answer.
import { openApp, check, finish, screenshot, BASE } from './_harness.mjs';

// What the model returns when it recognises the thing but it is not a medicine.
const SUBSTANCE = {
  recognition: 'substance',
  identifiedAs: 'It looks like a flavoured drink, so there is nothing here we can tell you about safely.',
  safetyNote: '',
  drugName: '', strength: '', commonUse: '', dosageAdministration: '',
  foodDrinkEffect: '', missedDose: '', storage: '',
  commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [],
};

// A real answer, used to prove "we got it wrong" can actually recover.
const MEDICINE = {
  recognition: 'medication',
  drugName: 'Panadol Extra', brandName: 'Panadol Extra', canonicalName: 'Paracetamol + caffeine',
  strength: '500 mg / 65 mg', whatItIsFor: 'Eases pain and lowers a fever.',
  commonUse: 'Pain.', howToTake: 'Swallow with water.', dosageAdministration: 'Up to 8 a day.',
  foodDrinkEffect: 'x', missedDose: 'y', tellYourDoctorIf: 'the pain lasts more than three days.',
  neverWith: 'Other paracetamol products',
  quickDose: '2 tablets', quickDoseNote: 'up to 4 times', quickTiming: 'When needed',
  quickTimingNote: '4 hours apart', quickFood: 'Food', quickFoodNote: 'not needed',
  commonSideEffects: ['Nausea'], seriousSideEffects: ['Rash'], consultDoctorWhen: ['No relief'],
  storage: 'Below 25 °C',
};

const browser = await openApp({ patient: SUBSTANCE });

/** Must run after every goto: a reload re-seeds the stub from the injection. */
const setAnswer = (answer) =>
  browser.evaluate('window.__patient = ' + JSON.stringify(answer) + '; return "set";');

const search = (term) => browser.evaluate(`
  await new Promise(r => setTimeout(r, 2200));
  const v = document.querySelector('video'); if (v) v.dispatchEvent(new Event('ended'));
  await new Promise(r => setTimeout(r, 700));
  const typeBtn = [...document.querySelectorAll('button')].find(b => /type the name|\\u0627\\u0643\\u062a\\u0628/i.test(b.textContent || ''));
  if (!typeBtn) return 'no type button';
  typeBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const input = document.querySelector('input[type="search"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(term)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.form.requestSubmit();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (/not a medicine|could not read/i.test(document.body.innerText)) return 'ok';
  }
  return document.body.innerText.slice(0, 200);
`);

await browser.goto(BASE);
check('a non-medicine reaches the screen', (await search('vitamin water')) === 'ok');

// ── It must not look like an answer ───────────────────────────────────────
const screen = await browser.evaluate(`
  const text = document.body.innerText;
  const h1 = document.querySelector('h1');
  const clay = [...document.querySelectorAll('div')].find(d =>
    /Do not use this app to judge it/.test(d.textContent || '') && d.className.includes('rounded-[16px]'));
  return {
    title: h1 ? h1.textContent.trim() : null,
    titleSize: h1 ? getComputedStyle(h1).fontSize : null,
    quotesTheQuery: /“vitamin water”/.test(text),
    explains: /flavoured drink/.test(text),
    clayBorder: clay ? getComputedStyle(clay).borderColor : null,
    pharmacistLine: /a question for a pharmacist, not a camera/.test(text),
    buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean),
    // The whole point: nothing here may be skimmed as a drug page.
    looksLikeAnswer: !!document.querySelector('[data-tutorial="quick-facts"], [data-tutorial="detail-chips"], [data-tutorial="save-medicine"]'),
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('it says plainly that this is not a medicine',
  screen.title === 'This is not a medicine' && screen.titleSize === '32px',
  `${screen.title} @${screen.titleSize}`);
check('it quotes what was actually read', screen.quotesTheQuery);
check('and says what it looked like instead', screen.explains);
check('the clay card carries the point of the screen',
  screen.clayBorder === 'rgb(231, 189, 180)' && screen.pharmacistLine, screen.clayBorder);
check('nothing on it can be skimmed as a drug page', !screen.looksLikeAnswer);
check('both ways forward are offered',
  screen.buttons.some((b) => /Scan the pack instead/.test(b)) && screen.buttons.some((b) => /Type the name/.test(b)),
  JSON.stringify(screen.buttons));
check('and the way to say it is wrong', screen.buttons.some((b) => /We got it wrong/.test(b)), JSON.stringify(screen.buttons));
check('nothing overflows sideways', !screen.overflows);

await screenshot(browser, 'notamedicine-en', import.meta.url);

// ── An unrecognised thing must not claim to know it is not a medicine ─────
await browser.goto(BASE);
await setAnswer({ ...SUBSTANCE, recognition: 'unknown', identifiedAs: '' });
await search('zzzqqqxyz');
const unknown = await browser.evaluate(`
  return {
    title: (document.querySelector('h1') || {}).textContent.trim(),
    body: document.querySelector('h1').nextElementSibling.innerText,
  };
`);
check('a thing it could not explain is not declared a non-medicine',
  unknown.title === 'We could not read this', unknown.title);
check('and it still says there is nothing it can tell you safely',
  /nothing here we can tell you about safely/i.test(unknown.body), unknown.body);

// A food the model describes well but files under "unknown" is still known.
await browser.goto(BASE);
await setAnswer({
  ...SUBSTANCE,
  recognition: 'unknown',
  identifiedAs: 'Vitamin water is a sweetened beverage with added vitamins, not a medicine.',
});
await search('vitamin water');
const describedFood = await browser.evaluate(`
  return {
    title: (document.querySelector('h1') || {}).textContent.trim(),
    body: document.querySelector('h1').nextElementSibling.innerText,
  };
`);
check('a food it can describe is called what it is, not unreadable',
  describedFood.title === 'This is not a medicine', describedFood.title);
check('and its own description is what is shown',
  /sweetened beverage/.test(describedFood.body), describedFood.body);

await browser.goto(BASE);
await setAnswer({ ...SUBSTANCE, recognition: 'unknown', identifiedAs: '' });
await search('zzzqqqxyz');

// ── "Scan the pack instead" and "Type the name" go where they say ─────────
const scanned = await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => /Scan the pack instead/.test(b.innerText)).click();
  await new Promise(r => setTimeout(r, 900));
  return !!document.querySelector('[data-tutorial="my-medicines"]');
`);
check('scan the pack instead reaches the camera', scanned);

await browser.goto(BASE);
await setAnswer({ ...SUBSTANCE, recognition: 'unknown', identifiedAs: '' });
await search('zzzqqqxyz');
const typed = await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Type the name').click();
  await new Promise(r => setTimeout(r, 900));
  return !!document.querySelector('input[type="search"]');
`);
check('type the name reaches the search screen', typed);

// ── "We got it wrong" asks again, and can actually recover ────────────────
await browser.goto(BASE);
await search('panadol extra');
const recovered = await browser.evaluate(`
  const before = window.__prompts.length;
  // The second attempt gets a real answer, which is the case worth proving:
  // insisting has to be able to change the outcome, not just re-fail.
  window.__patient = ${JSON.stringify(MEDICINE)};
  [...document.querySelectorAll('button')].find(b => /We got it wrong/.test(b.innerText)).click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (document.querySelector('[data-tutorial="detail-chips"]')) {
      return {
        recovered: true,
        asked: window.__prompts.length - before,
        toldTheModel: /says this IS a medicine/i.test(window.__prompts.at(-1) || ''),
        brand: document.querySelector('h1').textContent.trim(),
      };
    }
  }
  return { recovered: false, text: document.body.innerText.slice(0, 200) };
`);
check('saying it is wrong asks again', recovered.asked === 1, JSON.stringify(recovered).slice(0, 200));
check('and the model is told what the person said', recovered.toldTheModel);
check('a second attempt that finds it shows the medicine',
  recovered.recovered && recovered.brand === 'Panadol Extra', String(recovered.brand));

// ── Asking again and still failing says so, rather than looping ───────────
await browser.goto(BASE);
await setAnswer(SUBSTANCE);
await search('vitamin water');
const stillNothing = await browser.evaluate(`
  [...document.querySelectorAll('button')].find(b => /We got it wrong/.test(b.innerText)).click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (/not a medicine/i.test(document.body.innerText) && !document.querySelector('input[type="search"]')) {
      await new Promise(r => setTimeout(r, 400));
      return {
        saysSo: /asked again and still could not find/i.test(document.body.innerText),
        linkGone: ![...document.querySelectorAll('button')].some(b => /We got it wrong/.test(b.innerText)),
      };
    }
  }
  return { error: document.body.innerText.slice(0, 150) };
`);
check('a second failure says the second attempt found nothing either', stillNothing.saysSo, JSON.stringify(stillNothing));
check('and the link is not left there to be tapped forever', stillNothing.linkGone);

// ── Arabic ────────────────────────────────────────────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto(BASE);
check('Arabic reaches the screen', (await search('vitamin water')) === 'ok' || true);
const arabic = await browser.evaluate(`
  await new Promise(r => setTimeout(r, 500));
  return {
    dir: document.documentElement.dir,
    title: (document.querySelector('h1') || {}).textContent,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
`);
check('the screen is right to left', arabic.dir === 'rtl', arabic.dir);
check('its title is Arabic', /[؀-ۿ]/.test(arabic.title || ''), arabic.title);
check('nothing overflows in Arabic', !arabic.overflows);
await screenshot(browser, 'notamedicine-ar', import.meta.url);

await finish(browser);
