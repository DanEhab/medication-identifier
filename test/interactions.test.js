// One medicine on a list twice, under two names.
//
// This check exists because of the other half of the same bug. The answer cache
// used to be keyed on the active ingredient, so Abimol and Panadol were one
// entry and a list could not hold both — it was wrong about which medicine
// somebody had, and that wrongness happened to hide this.
//
// Filing answers by product fixed the identity and made the list able to hold
// two brands of one drug, so something now has to say so. Paracetamol is the
// commonest accidental overdose there is, and this is how it happens: two
// boxes, two names, nobody realising they are the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// The module imports only a type, which transpiling erases, so the whole file
// compiles and runs on its own with nothing to mock.
const source = readFileSync(fileURLToPath(new URL('../src/lib/interactions.ts', import.meta.url)), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { findDuplicateIngredients, findInteractions } =
  await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const med = (brandName, canonicalName, extra = {}) => ({
  originalName: brandName,
  drugInfo: {
    drugName: `${brandName} 500mg`,
    brandName,
    canonicalName,
    neverWith: '',
    ...extra,
  },
});

test('two brands of one ingredient are reported', () => {
  const found = findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Abimol', 'paracetamol'),
  ]);

  assert.equal(found.length, 1);
  assert.equal(found[0].ingredient, 'paracetamol');
  assert.deepEqual(found[0].names.sort(), ['Abimol', 'Panadol']);
});

test('three brands of one ingredient are one report, not three', () => {
  const found = findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Abimol', 'paracetamol'),
    med('Adol', 'paracetamol'),
  ]);

  assert.equal(found.length, 1, 'one ingredient is one thing to say');
  assert.equal(found[0].names.length, 3);
});

/*
  The case that is easiest to miss in real life: the same brand family, where
  one of them is a combination. Panadol Extra is paracetamol with caffeine, so
  taking it with plain Panadol is still two paracetamols.
*/
test('a combination sharing one ingredient is reported', () => {
  const found = findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Panadol Extra', 'caffeine+paracetamol'),
  ]);

  assert.equal(found.length, 1);
  assert.equal(found[0].ingredient, 'paracetamol');
});

test('the ingredient they do not share is not reported', () => {
  const found = findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Panadol Extra', 'caffeine+paracetamol'),
  ]);

  assert.ok(!found.some((d) => d.ingredient === 'caffeine'), 'only one of them has caffeine');
});

test('two combinations sharing two ingredients report both', () => {
  const found = findDuplicateIngredients([
    med('Augmentin', 'amoxicillin+clavulanic acid'),
    med('Curam', 'amoxicillin+clavulanic acid'),
  ]);

  assert.deepEqual(found.map((d) => d.ingredient).sort(), ['amoxicillin', 'clavulanic acid']);
});

/*
  The same ingredient under two names.

  Straight from the live API: Congestal came back as "paracetamol" and Comtrex
  as "acetaminophen". Both are cold-and-flu tablets, both are mostly
  paracetamol, and a plain string comparison finds the chlorpheniramine they
  share while staying silent about the one that could put somebody in hospital.
*/
test('one ingredient under two names is still one ingredient', () => {
  const found = findDuplicateIngredients([
    med('Congestal', 'chlorpheniramine+paracetamol+pseudoephedrine'),
    med('Comtrex', 'acetaminophen+chlorpheniramine+phenylephrine'),
  ]);

  const ingredients = found.map((d) => d.ingredient).sort();
  assert.ok(ingredients.includes('paracetamol'),
    `acetaminophen is paracetamol; got ${JSON.stringify(ingredients)}`);
  assert.ok(ingredients.includes('chlorpheniramine'));
});

test('the national variants people actually meet are treated as one', () => {
  for (const [a, b] of [
    ['acetaminophen', 'paracetamol'],
    ['albuterol', 'salbutamol'],
    ['epinephrine', 'adrenaline'],
    ['rifampin', 'rifampicin'],
  ]) {
    const found = findDuplicateIngredients([med('One', a), med('Two', b)]);
    assert.equal(found.length, 1, `${a} and ${b} are the same drug`);
  }
});

test('different ingredients are not a duplicate', () => {
  assert.deepEqual(findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Brufen', 'ibuprofen'),
  ]), []);
});

test('the same medicine saved twice is not a duplicate of itself', () => {
  // Two entries, one name: whatever produced that, it is not two boxes.
  assert.deepEqual(findDuplicateIngredients([
    med('Panadol', 'paracetamol'),
    med('Panadol', 'paracetamol'),
  ]), []);
});

test('an answer with no ingredient recorded is skipped, not guessed at', () => {
  assert.deepEqual(findDuplicateIngredients([
    med('Panadol', ''),
    med('Abimol', ''),
  ]), []);
});

test('case and spacing do not hide a duplicate', () => {
  const found = findDuplicateIngredients([
    med('Panadol', ' Paracetamol '),
    med('Abimol', 'paracetamol'),
  ]);
  assert.equal(found.length, 1);
});

test('a one-medicine list has nothing to report', () => {
  assert.deepEqual(findDuplicateIngredients([med('Panadol', 'paracetamol')]), []);
  assert.deepEqual(findDuplicateIngredients([]), []);
});

/*
  The two checks answer different questions and must not be confused. An
  interaction is "these two fight"; a duplicate is "these two are the same
  thing". Two paracetamols do not interact, so the interaction check is silent
  on exactly the case that matters most.
*/
test('the interaction check does not cover this, which is why this exists', () => {
  const list = [med('Panadol', 'paracetamol'), med('Abimol', 'paracetamol')];

  assert.deepEqual(findInteractions(list), [], 'nothing warns against its own ingredient');
  assert.equal(findDuplicateIngredients(list).length, 1);
});
