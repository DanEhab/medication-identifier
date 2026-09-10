// Both languages say the same things.
//
//   npm test
//
// A missing Arabic key renders as the key name to somebody reading Arabic, and
// a key added to one block and not the other is the easiest mistake to make in
// this file — it is two large object literals a long way apart. Parsed as text
// rather than imported because the module is TypeScript and this suite is not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo path can contain a space, so decode the URL rather than slicing it.
const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, '..', 'src', 'lib', 'translations.ts'), 'utf8');

const enBlock = SOURCE.slice(SOURCE.indexOf('  en: {'), SOURCE.indexOf('  ar: {'));
const arBlock = SOURCE.slice(SOURCE.indexOf('  ar: {'));

const keysIn = (block) => [...block.matchAll(/^ {4}([A-Za-z][A-Za-z0-9_]*):\s/gm)].map((m) => m[1]);

const duplicatesIn = (keys) => {
  const seen = new Set();
  return keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
};

const enKeys = keysIn(enBlock);
const arKeys = keysIn(arBlock);

test('the two blocks were found', () => {
  assert.ok(enKeys.length > 100, `only found ${enKeys.length} English keys`);
  assert.ok(arKeys.length > 100, `only found ${arKeys.length} Arabic keys`);
});

test('every English key has an Arabic one', () => {
  const missing = enKeys.filter((key) => !arKeys.includes(key));
  assert.deepEqual(missing, [], 'these would render as the key name in Arabic');
});

test('and no Arabic key is left over', () => {
  const extra = arKeys.filter((key) => !enKeys.includes(key));
  assert.deepEqual(extra, [], 'these are unreachable');
});

test('neither block declares the same key twice', () => {
  // The later one silently wins, so the app shows a string nobody edited.
  assert.deepEqual(duplicatesIn(enKeys), []);
  assert.deepEqual(duplicatesIn(arKeys), []);
});

test('no Arabic value is still in English', () => {
  // Two are Latin on purpose: the language switcher names the other language,
  // and ATC is an international code.
  const LATIN_BY_DESIGN = new Set(['language', 'atcLabel']);
  const arabicScript = /[؀-ۿ]/;

  const untranslated = [...arBlock.matchAll(/^ {4}([A-Za-z][A-Za-z0-9_]*):\s*'(.*)',\s*$/gm)]
    .filter(([, key, value]) => !LATIN_BY_DESIGN.has(key) && value.trim() && !arabicScript.test(value))
    .map(([, key, value]) => `${key}: ${value.slice(0, 40)}`);

  assert.deepEqual(untranslated, []);
});

test('nothing was mangled by an encoding round trip', () => {
  // Editing this file through a tool that guessed the encoding wrong has
  // produced replacement characters before now, and they are invisible in a
  // diff unless you look for them.
  assert.equal(SOURCE.includes('�'), false, 'the file contains replacement characters');
});
