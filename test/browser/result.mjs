// The result screen: the answer, weighted.
//
// What matters here is the ordering and the weighting, not that the words are
// present: a page that shows the same eleven facts in eleven equal boxes would
// pass a "does it contain the text" test and fail the point of the redesign.
import {
  openApp, check, finish, screenshot,
  reachCamera, searchFor, goBack,
} from './_harness.mjs';

const browser = await openApp();

check('the camera screen is reached', (await reachCamera(browser)) === 'ok');
check('a typed name reaches the result screen', (await searchFor(browser, 'Lipitor')) === 'ok');

// ── The page opens with the answer ─────────────────────────────────────────
const layout = await browser.evaluate(`
  const text = document.body.innerText;
  const h1 = document.querySelector('h1');
  const cs = getComputedStyle(h1);
  const wash = document.querySelector('[data-tutorial="what-it-is-for"]');
  return {
    brand: h1.textContent.trim(),
    brandSize: cs.fontSize,
    brandWeight: cs.fontWeight,
    ingredientShown: text.includes('ATORVASTATIN CALCIUM'),
    washBg: wash ? getComputedStyle(wash).backgroundColor : null,
    facts: [...document.querySelectorAll('[data-tutorial="quick-facts"] > div')]
      .map(f => f.innerText.replace(/\\n/g, ' ')),
    chips: [...document.querySelectorAll('[data-tutorial="detail-chips"] button')].map(c => c.textContent.trim()),
    hasPurpose: text.includes('Lowers bad cholesterol'),
    hasHowTo: text.includes('Swallow whole with water'),
    hasDoctorWarn: text.includes('unexplained muscle pain'),
    hasNeverWith: text.includes('Grapefruit juice'),
    hasProfessional: text.includes('Professional view'),
    saveLabel: (document.querySelector('[data-tutorial="save-medicine"]') || {}).innerText,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    // The order on the page is the argument the design makes.
    order: ['what-it-is-for', 'quick-facts', 'detail-chips', 'professional-link']
      .map(id => {
        const el = document.querySelector('[data-tutorial="' + id + '"]');
        return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : -1;
      }),
  };
`);

check('the brand name is the 40px headline',
  layout.brandSize === '40px' && layout.brandWeight === '600', `${layout.brandSize}/${layout.brandWeight}`);
check('the generic name sits above it in mono caps', layout.ingredientShown);
check('the purpose sits in the teal wash',
  layout.hasPurpose && layout.washBg === 'rgb(228, 241, 237)', layout.washBg);
check('three quick facts', layout.facts.length === 3, JSON.stringify(layout.facts));
check('how to take it is shown', layout.hasHowTo);
check('the amber warning is shown', layout.hasDoctorWarn);
check('the clay never-with card is shown', layout.hasNeverWith);
check('three reference chips', layout.chips.length === 3, JSON.stringify(layout.chips));
check('a professional view row', layout.hasProfessional);
check('the save button offers to save', /Save to my medicines/i.test(layout.saveLabel || ''), layout.saveLabel);
check('nothing overflows sideways', !layout.overflows);
check('the answer comes before the reference material',
  layout.order.every((top, i) => top >= 0 && (i === 0 || top > layout.order[i - 1])),
  JSON.stringify(layout.order));

// ── The chips lead somewhere rather than expanding in place ────────────────
const chip = await browser.evaluate(`
  document.querySelectorAll('[data-tutorial="detail-chips"] button')[0].click();
  await new Promise(r => setTimeout(r, 600));
  return { opened: document.body.innerText.includes('Headache') };
`);
check('a chip opens the side effects screen', chip.opened);
check('and back returns to the result screen', (await goBack(browser)) === 'ok');
check('with the same medicine on it', await browser.evaluate(`
  return !!document.querySelector('[data-tutorial="quick-facts"]');
`));

// ── Saving ─────────────────────────────────────────────────────────────────
const save = await browser.evaluate(`
  const btn = document.querySelector('[data-tutorial="save-medicine"]');
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  const list = JSON.parse(localStorage.getItem('myMedications') || '[]');
  return { label: btn.innerText.trim(), names: list.map(m => m.drugInfo.drugName) };
`);
check('saving flips the button and writes to the device',
  /Saved to my medicines/i.test(save.label) && save.names.length === 1,
  JSON.stringify(save));

// ── Exporting, and the one-time offer of patient details ──────────────────
const sheet = await browser.evaluate(`
  const share = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Export or share');
  share.click();
  await new Promise(r => setTimeout(r, 400));
  const dialog = document.querySelector('[role="dialog"]');
  return {
    open: !!dialog,
    options: dialog ? [...dialog.querySelectorAll('button')].map(b => b.innerText.split('\\n')[0]) : [],
  };
`);
check('the share button opens the export sheet', sheet.open, JSON.stringify(sheet.options));
check('offering PDF, a document, and patient details',
  sheet.options.some(o => /PDF/i.test(o)) &&
  sheet.options.some(o => /document/i.test(o)) &&
  sheet.options.some(o => /patient details/i.test(o)),
  JSON.stringify(sheet.options));

await browser.evaluate(`document.querySelector('[role="dialog"]').parentElement.click(); await new Promise(r => setTimeout(r, 300));`);
await browser.evaluate(`window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));`);
await screenshot(browser, 'result-en', import.meta.url);

// ── Arabic, where the bidi algorithm gets a say ───────────────────────────
await browser.evaluate(`localStorage.setItem('app-language', 'ar');`);
await browser.goto('http://localhost:4173');
check('Arabic reaches the same screen', (await reachCamera(browser)) === 'ok');
check('and the same lookup', (await searchFor(browser, 'Lipitor')) === 'ok');

const arabic = await browser.evaluate(`
  const isolated = [...document.querySelectorAll('bdi')].map(b => b.textContent.trim());
  return {
    dir: document.documentElement.dir,
    overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    hasArabicLabel: /\\u0644\\u0645\\u0627\\u0630\\u0627/.test(document.body.innerText),
    strength: isolated.find(t => /film-coated/.test(t)),
  };
`);
check('the result screen is right to left', arabic.dir === 'rtl', arabic.dir);
check('its section labels are Arabic', arabic.hasArabicLabel);
check('nothing overflows in Arabic', !arabic.overflows);
check('the Latin strength is not reordered by the bidi algorithm',
  arabic.strength === '20 mg film-coated tablet', String(arabic.strength));

await screenshot(browser, 'result-ar', import.meta.url);
await finish(browser);
