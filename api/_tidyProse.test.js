// Line breaks that landed inside a sentence.
//
//   npm test
//
// The fixture is the real one: Panadol's storage line was stored with newlines
// where its degree signs should have been, and the screen renders each line as
// its own paragraph — so it came out as three stubs, one of them "F)".

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeDrugInfo } = require('./_drugInfo.js');

const answerWith = (fields) => normalizeDrugInfo({
  recognition: 'medication',
  drugName: 'Panadol 500mg',
  commonUse: 'Pain and fever.',
  commonSideEffects: ['Nausea'],
  seriousSideEffects: ['Rash'],
  ...fields,
});

test('a degree sign that arrived as a newline is put back', () => {
  const info = answerWith({
    storage: 'Store at room temperature (15-30\nC or 59-86\nF) away from moisture and heat.',
  });
  assert.equal(
    info.storage,
    'Store at room temperature (15-30°C or 59-86°F) away from moisture and heat.',
  );
});

test('and the line is one paragraph again', () => {
  const info = answerWith({ storage: 'Below 25\nC, in the original pack.' });
  assert.ok(!info.storage.includes('\n'), JSON.stringify(info.storage));
});

/*
  The letter has to stand alone. "Call your doctor" on a new line after a
  number is a sentence, not a temperature, and turning it into "2°Call" would
  be worse than the thing being fixed.
*/
test('a word beginning with C is not a temperature', () => {
  const info = answerWith({ missedDose: 'Take 2\nCall your doctor if unsure.' });
  assert.ok(!info.missedDose.includes('°'), info.missedDose);
  assert.equal(info.missedDose, 'Take 2 Call your doctor if unsure.');
});

test('a break in the middle of a clause becomes a space', () => {
  const info = answerWith({ howToTake: 'Swallow whole with\nwater.' });
  assert.equal(info.howToTake, 'Swallow whole with water.');
});

test('a break after a full stop is left alone', () => {
  // Two real sentences on two lines are two paragraphs, and the screen is
  // right to render them that way.
  const info = answerWith({ howToTake: 'Swallow whole.\nDo not chew it.' });
  assert.equal(info.howToTake, 'Swallow whole.\nDo not chew it.');
});

test('a list is left as a list', () => {
  const info = answerWith({ dosageAdministration: 'Take it like this:\n- with water\n- in the morning' });
  assert.match(info.dosageAdministration, /\n- with water\n- in the morning/);
});

test('a blank line between paragraphs survives', () => {
  const info = answerWith({ foodDrinkEffect: 'Avoid alcohol.\n\nGrapefruit is fine.' });
  assert.ok(info.foodDrinkEffect.includes('\n\n'), JSON.stringify(info.foodDrinkEffect));
});

test('the items in a list are tidied too', () => {
  const info = answerWith({ commonSideEffects: ['Feeling sick after\neating', 'Headache'] });
  assert.deepEqual(info.commonSideEffects, ['Feeling sick after eating', 'Headache']);
});

test('text with nothing wrong with it is untouched', () => {
  const clean = 'Store below 25 °C, in the original pack.';
  assert.equal(answerWith({ storage: clean }).storage, clean);
});

test('an empty field stays empty rather than becoming undefined', () => {
  assert.equal(answerWith({ storage: '' }).storage, '');
});
