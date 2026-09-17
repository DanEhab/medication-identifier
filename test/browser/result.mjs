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
/*
  ── The page has a structure, and it says so ─────────────────────────────

  It used to have no headings at all: a teal card, three tiles, a mono label, a
  warning card, another warning card, a row of pills. Every block a different
  shape at a different weight, with nothing saying which of them were peers.
*/
const structure = await browser.evaluate(`
  const headings = [...document.querySelectorAll('h2')].map(h => h.textContent.trim());
  const icon = document.querySelector('[data-testid="dosage-form-icon"]');
  return {
    headings,
    // The dose row and the instructions answer one question and now sit under
    // one heading, which has to come before the warnings.
    takeBeforeWarnings: headings.indexOf('How to take it') >= 0
      && headings.indexOf('How to take it') < headings.indexOf('Warnings'),
    iconForm: icon ? icon.getAttribute('data-form') : null,
    settings: !!document.querySelector('[data-testid="open-settings"]'),
    // Save and share were in the top bar as well as the bar at the foot.
    topBarButtons: document.querySelectorAll('header button, .flex.items-center.justify-between > button').length,
  };
`);
check('the page is divided into named sections',
  structure.headings.includes('How to take it')
  && structure.headings.includes('Warnings')
  && structure.headings.includes('More about this medicine'),
  JSON.stringify(structure.headings));
check('and they run in the order somebody reads them', structure.takeBeforeWarnings,
  JSON.stringify(structure.headings));

/*
  The tile beside the name is a picture of the form, not a dark square. It was
  a placeholder that never became anything — and it carried `rtl:hidden`, so an
  Arabic reader saw a name with nothing beside it at all.
*/
check('the name has a picture of the form beside it', structure.iconForm === 'tablet',
  String(structure.iconForm));

/*
  Settings is reachable from the medicine. Changing the language, the theme or
  replaying the tour used to mean leaving the page, changing the setting, and
  searching for the medicine again.
*/
check('settings can be reached without leaving the medicine', structure.settings);

const neverWith = await browser.evaluate(`
  const items = [...document.querySelectorAll('li')].map(li => li.innerText.trim());
  return { items, anyRunOn: items.some(i => i.includes('·')) };
`);
check('the things it must not be taken with are a list, not a paragraph',
  neverWith.items.length >= 3, JSON.stringify(neverWith.items));
check('and no item still holds the separator', !neverWith.anyRunOn, JSON.stringify(neverWith.items));

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

// The tile was `rtl:hidden`, so this side of the app had no picture at all.
const arabicIcon = await browser.evaluate(`
  const icon = document.querySelector('[data-testid="dosage-form-icon"]');
  if (!icon) return null;
  const box = icon.getBoundingClientRect();
  return { form: icon.getAttribute('data-form'), width: Math.round(box.width) };
`);
check('ar: the form picture is shown here too', arabicIcon !== null, 'it used to be rtl:hidden');
check('ar: and it is the same form', arabicIcon?.form === 'tablet', String(arabicIcon?.form));

await screenshot(browser, 'result-ar', import.meta.url);
await finish(browser);
