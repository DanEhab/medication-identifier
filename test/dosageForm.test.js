// Which picture goes beside the medicine's name.
//
// The rule has to work on answers that predate the field it prefers, and in
// Arabic, where the text it reads has been translated — an Arabic reader's
// copy says "قرص", never "tablet". Both are the normal case, not edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/lib/dosageForm.ts', import.meta.url)), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { dosageFormOf, isSwallowed, DOSAGE_FORMS } =
  await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

// ── What the model says, when it says anything ──────────────────────────────

test('a stated form is used as given', () => {
  assert.equal(dosageFormOf({ dosageForm: 'inhaler', strength: '100 mcg' }), 'inhaler');
});

test('a stated form beats the words in the text', () => {
  // The pack says cream; the name happens to contain "tablet".
  assert.equal(
    dosageFormOf({ dosageForm: 'cream', strength: '2% cream', drugName: 'Tabletta 2%' }),
    'cream',
  );
});

test('a form the app cannot draw falls through to the text', () => {
  assert.equal(dosageFormOf({ dosageForm: 'implant', strength: '500 mg tablet' }), 'tablet');
});

test('a stated "unknown" is not treated as an answer', () => {
  assert.equal(dosageFormOf({ dosageForm: 'unknown', strength: '150 mg capsule' }), 'capsule');
});

// ── Read off the strength, which is what older answers have ─────────────────

const cases = [
  ['500 mg tablet', 'tablet'],
  ['20 mg film-coated tablet', 'tablet'],
  ['500 mg / 65 mg tablet', 'tablet'],
  ['150 mg capsule', 'capsule'],
  ['250 mg soft gelatin capsules', 'capsule'],
  ['120 ml syrup', 'liquid'],
  ['oral suspension 250 mg/5 ml', 'liquid'],
  ['2% cream', 'cream'],
  ['5% ointment', 'cream'],
  ['0.05% topical gel', 'cream'],
  ['100 mcg inhaler', 'inhaler'],
  ['eye drops 0.5%', 'drops'],
  ['10 mg/ml solution for injection', 'injection'],
  ['1 g vial', 'injection'],
  ['12.5 mg suppository', 'suppository'],
  ['5 mg/24 h transdermal patch', 'patch'],
  ['nasal spray 50 mcg', 'spray'],
  ['1 g sachet', 'sachet'],
  ['effervescent granules', 'sachet'],
];

for (const [strength, expected] of cases) {
  test(`"${strength}" is a ${expected}`, () => {
    assert.equal(dosageFormOf({ strength }), expected);
  });
}

// ── The same, in Arabic ─────────────────────────────────────────────────────

const arabicCases = [
  ['500 ملغ قرص', 'tablet'],
  ['أقراص مغلفة 20 ملغ', 'tablet'],
  ['كبسولة 150 ملغ', 'capsule'],
  ['شراب 120 مل', 'liquid'],
  ['معلق فموي', 'liquid'],
  ['كريم 2%', 'cream'],
  ['مرهم 5%', 'cream'],
  ['قطرة للعين', 'drops'],
  ['حقنة 10 ملغ', 'injection'],
  ['لبوس 12.5 ملغ', 'suppository'],
  ['لاصقة جلدية', 'patch'],
  ['كيس فوار', 'sachet'],
];

for (const [strength, expected] of arabicCases) {
  test(`Arabic "${strength}" is a ${expected}`, () => {
    assert.equal(dosageFormOf({ strength }), expected);
  });
}

// ── Not guessing ────────────────────────────────────────────────────────────

/*
  An answer that never said what shape it is gets the mark that means exactly
  that. Defaulting to a tablet because tablets are commonest would put a
  picture of a tablet next to a tube of cream, which is the one thing the
  picture exists to prevent.
*/
test('nothing recognisable is unknown, not a tablet', () => {
  assert.equal(dosageFormOf({ strength: '20 mg', drugName: 'Something 20 mg' }), 'unknown');
  assert.equal(dosageFormOf({}), 'unknown');
  assert.equal(dosageFormOf(null), 'unknown');
  assert.equal(dosageFormOf(undefined), 'unknown');
});

test('a word that merely contains a form word does not count', () => {
  assert.equal(dosageFormOf({ strength: 'tabletop dispenser' }), 'unknown');
  assert.equal(dosageFormOf({ strength: 'droplet size' }), 'unknown');
});

// ── Order, where the words overlap ──────────────────────────────────────────

test('an inhaler is an inhaler, not a spray', () => {
  assert.equal(dosageFormOf({ strength: 'metered dose inhaler, 200 sprays' }), 'inhaler');
});

test('eye drops are drops, not a solution', () => {
  assert.equal(dosageFormOf({ strength: 'sterile eye drops solution' }), 'drops');
});

test('a pre-filled syringe is an injection, not a liquid', () => {
  assert.equal(dosageFormOf({ strength: 'pre-filled syringe, 40 mg/0.4 ml solution' }), 'injection');
});

test('the strength is trusted over the name', () => {
  // "Solution" here is part of a brand, and the pack says tablet.
  assert.equal(
    dosageFormOf({ strength: '10 mg tablet', drugName: 'Derma Solution 10 mg' }),
    'tablet',
  );
});

test('the name is used when the strength says nothing', () => {
  assert.equal(dosageFormOf({ strength: '2%', drugName: 'Fucidin 2% Cream' }), 'cream');
});

test('every form the list names can be drawn', () => {
  // The icon component keys off this list, so a form here with no art would
  // render as a blank tile.
  assert.ok(DOSAGE_FORMS.includes('unknown'));
  assert.equal(new Set(DOSAGE_FORMS).size, DOSAGE_FORMS.length);
});

// ── "Take" or "use" ─────────────────────────────────────────────────────────

/*
  "How to take it" is the wrong heading over a cream. The form is known, so the
  heading can simply be right rather than generic.
*/
test('the things you swallow are taken', () => {
  for (const form of ['tablet', 'capsule', 'liquid', 'sachet']) {
    assert.equal(isSwallowed(form), true, form);
  }
});

test('the things you do not swallow are used', () => {
  for (const form of ['cream', 'inhaler', 'injection', 'suppository', 'patch', 'spray', 'drops']) {
    assert.equal(isSwallowed(form), false, form);
  }
});

test('an unknown form keeps the ordinary wording', () => {
  // Most medicines are swallowed, so "take" reads as neutral where "use"
  // would read as a claim that this one is not.
  assert.equal(isSwallowed('unknown'), true);
});

test('every form is decided one way or the other', () => {
  for (const form of DOSAGE_FORMS) {
    assert.equal(typeof isSwallowed(form), 'boolean', form);
  }
});
