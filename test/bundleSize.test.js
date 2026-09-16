// What the app costs to load.
//
// A bundle grows a kilobyte at a time and nobody ever notices the day it got
// too big. These are budgets rather than measurements: they fail when
// something has been added that is worth a conversation, and the number in the
// failure is the conversation.
//
// Budgeted against the built output, because that is what ships. The device
// suite cannot do this — the assets come out of the APK, so every transferSize
// it can read is zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/assets', import.meta.url));

const sized = (pattern) => {
  if (!existsSync(dist)) return [];
  return readdirSync(dist)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const path = `${dist}/${name}`;
      return { name, raw: statSync(path).size, gzip: gzipSync(readFileSync(path)).length };
    });
};

const kb = (bytes) => Math.round(bytes / 1024);

test('the built assets exist to measure', () => {
  assert.ok(existsSync(dist), 'run `npm run build` first — there is nothing in dist/assets');
});

test('the JavaScript stays inside its budget', () => {
  const scripts = sized(/\.js$/);
  const total = scripts.reduce((sum, file) => sum + file.gzip, 0);
  const detail = scripts.map((f) => `${f.name} ${kb(f.gzip)}KB`).join(', ');
  // 140KB gzipped. The app was at 113 when this was written; the headroom is
  // for features, not for a charting library arriving by accident.
  assert.ok(kb(total) < 140, `${kb(total)}KB gzipped — ${detail}`);
});

test('the CSS stays inside its budget', () => {
  const styles = sized(/\.css$/);
  const total = styles.reduce((sum, file) => sum + file.gzip, 0);
  // Tailwind only emits what is used, so this only grows if the palette or the
  // component set does.
  assert.ok(kb(total) < 20, `${kb(total)}KB gzipped`);
});

test('nothing enormous slipped into the assets', () => {
  if (!existsSync(dist)) return;
  const big = readdirSync(dist)
    .map((name) => ({ name, size: statSync(`${dist}/${name}`).size }))
    .filter((file) => file.size > 600 * 1024)
    .map((file) => `${file.name} ${kb(file.size)}KB`);
  assert.deepEqual(big, [], 'an asset over 600KB is almost always a mistake');
});
