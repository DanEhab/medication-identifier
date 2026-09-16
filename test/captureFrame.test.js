// What the shutter actually photographs.
//
// The preview is object-cover, so it crops the camera frame to fit a box that
// is not the camera's shape. The capture took the whole frame anyway, which
// meant the picture sent for reading carried bands the person framing the pack
// never saw. These are the sums that make the two agree, tested without a
// camera, a canvas or a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/*
  The source is TypeScript and the test runner is not, so it is transpiled
  here rather than duplicated. Duplicating it would mean testing a copy, and a
  copy cannot go wrong in the same way the original does.
*/
const source = readFileSync(fileURLToPath(new URL('../src/lib/captureFrame.ts', import.meta.url)), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { coverCrop } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test('a preview the same shape as the camera crops nothing', () => {
  const crop = coverCrop(1200, 1600, 300, 400);
  assert.equal(crop.sourceX, 0);
  assert.equal(crop.sourceY, 0);
  assert.equal(crop.sourceWidth, 1200);
  assert.equal(crop.sourceHeight, 1600);
});

test('a preview wider than the camera loses the top and bottom, not the sides', () => {
  // 480x640 sensor in a 383x481 box: the case measured on the emulator.
  const crop = coverCrop(480, 640, 383, 481);
  assert.equal(crop.sourceWidth, 480, 'the full width is kept');
  assert.ok(crop.sourceHeight < 640, 'height is trimmed');
  assert.equal(crop.sourceX, 0);
  assert.ok(crop.sourceY > 0, 'and trimmed equally from both ends');
  // What is dropped is what the user could not see.
  const lost = 1 - (crop.sourceWidth * crop.sourceHeight) / (480 * 640);
  assert.ok(lost > 0.05 && lost < 0.07, `about 6% is dropped, got ${(lost * 100).toFixed(1)}%`);
});

test('a preview taller than the camera loses the sides', () => {
  const crop = coverCrop(1600, 1200, 300, 600);
  assert.equal(crop.sourceHeight, 1200, 'the full height is kept');
  assert.ok(crop.sourceWidth < 1600);
  assert.equal(crop.sourceY, 0);
  assert.ok(crop.sourceX > 0);
});

test('the crop is centred, so what was framed in the middle stays in the middle', () => {
  const crop = coverCrop(480, 640, 383, 481);
  const bottomMargin = 640 - (crop.sourceY + crop.sourceHeight);
  // Within a pixel: an odd number of rows to drop cannot be split evenly.
  assert.ok(Math.abs(crop.sourceY - bottomMargin) <= 1,
    `top ${crop.sourceY} and bottom ${bottomMargin} must match`);
});

test('the rectangle is whole pixels, so nothing is resampled on the way out', () => {
  const crop = coverCrop(480, 640, 383, 481);
  for (const [name, value] of Object.entries(crop)) {
    assert.ok(Number.isInteger(value), `${name} is ${value}`);
  }
});

test('a big sensor is scaled down to the long edge', () => {
  const crop = coverCrop(4000, 3000, 400, 300, 1600);
  assert.equal(Math.max(crop.width, crop.height), 1600);
  // The shape must survive the downscale, or the photo is stretched.
  assert.ok(Math.abs(crop.width / crop.height - crop.sourceWidth / crop.sourceHeight) < 0.01);
});

test('a small sensor is never scaled up', () => {
  const crop = coverCrop(640, 480, 400, 300, 1600);
  assert.equal(crop.width, 640);
  assert.equal(crop.height, 480);
});

test('the source rectangle never asks for pixels the frame does not have', () => {
  // Every shape of box against every shape of sensor, including the exact
  // matches where floating point can push the result a hair over the edge.
  for (const [vw, vh] of [[480, 640], [1600, 1200], [1080, 1080], [4032, 3024]]) {
    for (const [bw, bh] of [[383, 481], [300, 600], [400, 400], [1000, 300]]) {
      const crop = coverCrop(vw, vh, bw, bh);
      assert.ok(crop.sourceX >= 0 && crop.sourceY >= 0, `${vw}x${vh} in ${bw}x${bh}`);
      assert.ok(crop.sourceX + crop.sourceWidth <= vw, `${vw}x${vh} in ${bw}x${bh}`);
      assert.ok(crop.sourceY + crop.sourceHeight <= vh, `${vw}x${vh} in ${bw}x${bh}`);
    }
  }
});

test('nothing measurable means no photo rather than an empty one', () => {
  // A shutter pressed before the stream settles: videoWidth is still 0.
  assert.equal(coverCrop(0, 0, 383, 481), null);
  assert.equal(coverCrop(480, 640, 0, 0), null);
});
