// Nothing secret may ship to a phone.
//
// The Gemini key and the MongoDB connection string live only in the server's
// environment: the app talks to /api/*, and /api/* talks to Gemini. That is the
// whole security model, and it holds right up until somebody writes
// `import.meta.env.VITE_GEMINI_KEY` one afternoon and Vite quietly inlines the
// value into a file that is then packed into an APK and published.
//
// An APK is a zip. Anybody can open one. So this reads what was actually built
// and fails if a credential-shaped string is anywhere in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));

/** Every file in dist/, at any depth. */
const builtFiles = (dir = dist) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? builtFiles(path) : [path];
  });
};

// Only text is worth scanning. The icon and the intro video are not going to
// contain a key, and reading them as UTF-8 produces noise that matches nothing.
const TEXT = /\.(js|mjs|cjs|css|html|json|map|txt|svg|webmanifest)$/i;

/**
 * Value shapes, not variable names.
 *
 * Matching on names would fail the moment a comment mentioned one; matching on
 * shapes fails only when an actual credential is present, which is the thing
 * worth failing over.
 */
const SECRETS = [
  { what: 'a Google / Gemini API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { what: 'a MongoDB connection string', pattern: /mongodb(\+srv)?:\/\/[^\s"'`]+/i },
  { what: 'an OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { what: 'a private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { what: 'an AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { what: 'a GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  // A bearer token hard-coded into a fetch call, as opposed to one read from a
  // variable at runtime.
  { what: 'a hard-coded bearer token', pattern: /["'`]Bearer\s+[A-Za-z0-9._-]{20,}["'`]/ },
];

test('the built output exists to scan', () => {
  assert.ok(existsSync(dist), 'run `npm run build` first — there is nothing in dist/');
});

test('no credential is anywhere in what ships to the phone', () => {
  const found = [];

  for (const path of builtFiles()) {
    if (!TEXT.test(path)) continue;
    const contents = readFileSync(path, 'utf8');
    for (const { what, pattern } of SECRETS) {
      const hit = contents.match(pattern);
      if (hit) {
        // Report enough to find it, never enough to be the leak itself.
        found.push(`${path.slice(dist.length + 1)}: ${what} (starts "${hit[0].slice(0, 8)}…")`);
      }
    }
  }

  assert.deepEqual(found, [], `a credential reached the bundle:\n  ${found.join('\n  ')}`);
});

test('no secret-looking build-time variable was inlined', () => {
  // Vite inlines anything named VITE_*. That is the intended escape hatch for
  // public configuration — and the exact mechanism by which a key gets shipped
  // by accident, so the names themselves are worth refusing.
  const dangerous = /VITE_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|URI|CREDENTIAL)[A-Z0-9_]*/;
  const found = [];

  for (const path of builtFiles()) {
    if (!TEXT.test(path)) continue;
    const hit = readFileSync(path, 'utf8').match(dangerous);
    if (hit) found.push(`${path.slice(dist.length + 1)}: ${hit[0]}`);
  }

  assert.deepEqual(found, [], `a secret-looking variable was built in:\n  ${found.join('\n  ')}`);
});
