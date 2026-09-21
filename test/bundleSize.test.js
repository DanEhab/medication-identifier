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

/*
  Everything in public/ is copied to the root of dist/ and packed into the APK,
  and none of it passes through the bundler — so none of it was measured here.

  That gap was worth about a megabyte: a 512x512 app icon rendered at 104 CSS
  pixels, and a moon and a sun left over from a dark-mode toggle that had been
  replaced by a text control two versions earlier. A quarter of a megabyte of
  the download was artwork nothing referenced.
*/
const distRoot = fileURLToPath(new URL('../dist', import.meta.url));

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

/** The static files, as copied — images, video, the policy pages. */
const staticFiles = () => {
  if (!existsSync(distRoot)) return [];
  return readdirSync(distRoot)
    .filter((name) => name !== 'assets' && !name.endsWith('.html'))
    .map((name) => ({ name, size: statSync(`${distRoot}/${name}`).size }))
    .filter((file) => file.size > 0);
};

test('no static image is larger than the screen it lands on', () => {
  // 40KB per image. The largest any of them is drawn is 104 CSS pixels, so
  // even a 4x screen wants under 420 across — and these compress well, being
  // flat colour with hard edges. A file over this is a full-resolution source
  // that was never resized, which is how the icon got to 337KB.
  const heavy = staticFiles()
    .filter((file) => /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name))
    .filter((file) => file.size > 40 * 1024)
    .map((file) => `${file.name} ${kb(file.size)}KB`);
  assert.deepEqual(heavy, [], 'resize it, or say here why it has to be this big');
});

test('the static files as a whole stay inside their budget', () => {
  const files = staticFiles();
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const detail = files.map((f) => `${f.name} ${kb(f.size)}KB`).join(', ');
  /*
    600KB, which the launch clip alone accounts for 508KB of. This is a budget
    for what is added beside it, not an invitation to grow the clip: it is
    played once per launch on a phone that may be on mobile data, and it is
    already the single largest thing in the download.
  */
  assert.ok(kb(total) < 600, `${kb(total)}KB of static files — ${detail}`);
});
