// The two warning lists, told apart.
//
// Both are filled from the same knowledge, so the urgent items turn up in the
// gentler list as well, written out as sentences. The fixtures here are the
// real ones from Eltroxin's answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/lib/sideEffects.ts', import.meta.url)), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { withoutUrgentRepeats } =
  await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const URGENT = [
  'Chest pain',
  'fast or irregular heartbeat',
  'shortness of breath',
  'swelling of face/tongue/throat, severe dizziness, trouble breathing',
];

const CONSULT = [
  'You experience chest pain or a very fast heart rate',
  'you feel unusually anxious or have tremors',
  "your symptoms of hypothyroidism worsen or don't improve",
  'you develop a rash or severe itching',
  'you become pregnant or are breastfeeding',
];

test('the line that repeats an urgent one is dropped', () => {
  const kept = withoutUrgentRepeats(CONSULT, URGENT);
  assert.ok(!kept.some((line) => /chest pain/i.test(line)),
    `chest pain is already in the urgent list — got ${JSON.stringify(kept)}`);
});

test('and everything that is genuinely different is kept', () => {
  const kept = withoutUrgentRepeats(CONSULT, URGENT);
  assert.deepEqual(kept, [
    'you feel unusually anxious or have tremors',
    "your symptoms of hypothyroidism worsen or don't improve",
    'you develop a rash or severe itching',
    'you become pregnant or are breastfeeding',
  ]);
});

/*
  Being pregnant is not an emergency. The gentler list exists for exactly this
  kind of thing, so a rule that emptied it would be as wrong as one that
  changed nothing.
*/
test('a non-urgent reason survives even beside a long urgent list', () => {
  const kept = withoutUrgentRepeats(['you become pregnant or are breastfeeding'], URGENT);
  assert.equal(kept.length, 1);
});

test('a longer form of the same word counts as the same word', () => {
  // The lists are written in different registers: fragments against sentences.
  assert.deepEqual(
    withoutUrgentRepeats(['you notice a fast or irregular heartbeat'], ['irregular heartbeat']),
    [],
  );
});

test('sharing one word is not repeating', () => {
  // "trouble breathing" and "trouble sleeping" are different things.
  assert.deepEqual(
    withoutUrgentRepeats(['you have trouble sleeping'], ['trouble breathing']),
    ['you have trouble sleeping'],
  );
});

test('a long sentence does not swallow an unrelated short one', () => {
  // The direction of the check matters: the urgent item has to be covered by
  // the line, not the other way round.
  const kept = withoutUrgentRepeats(
    ['you develop a rash'],
    ['a rash with blistering, peeling skin, fever and swelling of the throat'],
  );
  assert.deepEqual(kept, ['you develop a rash']);
});

test('an empty urgent list changes nothing', () => {
  assert.deepEqual(withoutUrgentRepeats(CONSULT, []), CONSULT);
});

test('an empty consult list stays empty', () => {
  assert.deepEqual(withoutUrgentRepeats([], URGENT), []);
});

test('an urgent entry with no meaningful words drops nothing', () => {
  // A stray "severe" on its own must not empty the other list.
  assert.deepEqual(withoutUrgentRepeats(['you become pregnant'], ['severe']),
    ['you become pregnant']);
});

test('case and punctuation do not hide a repeat', () => {
  assert.deepEqual(withoutUrgentRepeats(['CHEST PAIN.'], ['chest pain']), []);
});
