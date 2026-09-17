// What a search term and an answer are filed under.
//
//   npm test
//
// These functions decide which medicine a person is shown, and they had no
// tests of their own. That is how "Abimol" came to be answered with Panadol's
// record: the rule that two brands sharing an ingredient are one medicine was
// never written down anywhere it could be checked, only implied by a key.

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeKey, queryKeyFor, storageKeyFor, aliasIsSafe } = require('./_cacheKey');

// ── Reducing text to something comparable ───────────────────────────────────

test('case, spacing and punctuation do not make two keys', () => {
  assert.equal(normalizeKey('  PANADOL '), 'panadol');
  assert.equal(normalizeKey('Co-Trimoxazole'), 'co trimoxazole');
});

test('accents do not make two keys', () => {
  assert.equal(normalizeKey('Lévothyrox'), normalizeKey('Levothyrox'));
});

test('Arabic is kept, because people type brand names in it', () => {
  assert.equal(normalizeKey('بنادول'), 'بنادول');
});

test('the joiner in a combination is spaced consistently', () => {
  assert.equal(normalizeKey('amoxicillin + clavulanic acid'), 'amoxicillin+clavulanic acid');
  assert.equal(normalizeKey('amoxicillin+clavulanic acid'), 'amoxicillin+clavulanic acid');
});

// ── The term somebody typed ─────────────────────────────────────────────────

test('strength and form are not part of what was asked for', () => {
  assert.equal(queryKeyFor('Ibuprofen 400mg tablets'), 'ibuprofen');
  assert.equal(queryKeyFor('ibuprofen 200 mg'), 'ibuprofen');
  assert.equal(queryKeyFor('Panadol 500mg'), 'panadol');
});

test('a term that is nothing but a strength still produces a key', () => {
  // Someone searching "500mg" gets a useless answer either way, but an empty
  // key would be written to the database as one shared row.
  assert.equal(queryKeyFor('500mg'), '500mg');
});

test('a variant keeps the word that makes it a variant', () => {
  assert.equal(queryKeyFor('Panadol Extra 500mg'), 'panadol extra');
});

// ── Where an answer is filed ────────────────────────────────────────────────

const answer = (fields) => ({ drugName: '', brandName: '', canonicalName: '', ...fields });

test('an answer is filed under its brand', () => {
  assert.equal(
    storageKeyFor(answer({ drugName: 'Panadol 500mg', brandName: 'Panadol', canonicalName: 'paracetamol' })),
    'panadol',
  );
});

/*
  The whole point. Two brands of paracetamol are two medicines on a shelf, and
  filing them together meant whichever was searched first owned the row — so the
  second person was shown the first person's brand.
*/
test('two brands of one ingredient are filed apart', () => {
  const panadol = answer({ drugName: 'Panadol 500mg', brandName: 'Panadol', canonicalName: 'paracetamol' });
  const abimol = answer({ drugName: 'Abimol 500mg', brandName: 'Abimol', canonicalName: 'paracetamol' });

  assert.notEqual(storageKeyFor(panadol), storageKeyFor(abimol));
});

test('a variant with another ingredient is filed apart from the plain product', () => {
  const plain = answer({ brandName: 'Panadol', canonicalName: 'paracetamol' });
  const extra = answer({ brandName: 'Panadol Extra', canonicalName: 'caffeine+paracetamol' });

  assert.equal(storageKeyFor(plain), 'panadol');
  assert.equal(storageKeyFor(extra), 'panadol extra');
});

test('a medicine sold only generically is filed under its ingredient', () => {
  // The model repeats the generic name in the brand field for these, and a
  // brand that only restates the ingredient is not a brand.
  assert.equal(
    storageKeyFor(answer({ drugName: 'Metformin 500mg', brandName: 'Metformin', canonicalName: 'metformin' })),
    'metformin',
  );
});

test('a search for the ingredient itself is filed under the ingredient', () => {
  assert.equal(
    storageKeyFor(answer({ drugName: 'Paracetamol 500mg', brandName: 'Paracetamol', canonicalName: 'paracetamol' })),
    'paracetamol',
  );
});

test('the strength in the brand field does not change where it is filed', () => {
  assert.equal(storageKeyFor(answer({ brandName: 'Panadol 500mg', canonicalName: 'paracetamol' })), 'panadol');
});

test('an answer with no brand falls back to the ingredient, then to the name', () => {
  assert.equal(storageKeyFor(answer({ drugName: 'Aspirin', canonicalName: 'acetylsalicylic acid' })),
    'acetylsalicylic acid');
  assert.equal(storageKeyFor(answer({ drugName: 'Aspirin' })), 'aspirin');
});

test('nothing to file on is null rather than an empty key', () => {
  assert.equal(storageKeyFor(null), null);
  assert.equal(storageKeyFor(answer({})), null);
});

// ── Recording that one spelling means one medicine ──────────────────────────

test('spellings of the same product may point at it', () => {
  assert.equal(aliasIsSafe('panadooll', 'panadol'), true);
  assert.equal(aliasIsSafe('بنادول', 'panadol'), true);
});

test('an entry never points at itself', () => {
  assert.equal(aliasIsSafe('panadol', 'panadol'), false);
});

/*
  A single ingredient is not a spelling of a combination containing it.

  In the live database "calcium" pointed at a four-ingredient supplement,
  because one person's search had been answered with one, and everybody typing
  "calcium" afterwards was shown it.
*/
test('one ingredient may not point at a combination containing it', () => {
  assert.equal(aliasIsSafe('calcium', 'calcium+magnesium+manganese+zinc'), false);
});

test('but a term naming every ingredient may', () => {
  assert.equal(
    aliasIsSafe('glucosamine hydrochloride and chondroitin sulfate', 'chondroitin sulfate+glucosamine hydrochloride'),
    true,
  );
});

test('an unrecognisable name for a combination simply gets no pointer', () => {
  // Fails closed: "co-amoxiclav" really is amoxicillin with clavulanic acid,
  // and refusing the pointer costs one lookup rather than risking a wrong one.
  assert.equal(aliasIsSafe('co amoxiclav', 'amoxicillin+clavulanic acid'), false);
});

test('a missing key on either side is never a pointer', () => {
  assert.equal(aliasIsSafe('', 'panadol'), false);
  assert.equal(aliasIsSafe('panadooll', null), false);
});
