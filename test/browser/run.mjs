// Runs every browser suite against a build, and reports once.
//
//   npm run test:browser
//
// Each suite is a separate process: one that crashes must not take the rest
// with it, and a Chrome that fails to close cannot leak into the next.

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:4173';

const suites = readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && !name.startsWith('_') && name !== 'run.mjs')
  .sort();

// A suite against a server that is not running fails in a confusing way, so
// say the useful thing instead.
try {
  const response = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(String(response.status));
} catch {
  console.error(
    `Nothing is serving ${BASE}.\n` +
    'Run `npm run build && npm run preview` in another terminal first,\n' +
    'or point BASE at a deployment.',
  );
  process.exit(1);
}

const run = (suite) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, suite)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BASE },
    });

    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    child.on('close', (code) => {
      const passed = (output.match(/^PASS/gm) || []).length;
      const failed = (output.match(/^FAIL/gm) || []).length;
      resolve({ suite, code, passed, failed, output, ms: Date.now() - started });
    });
  });

const results = [];
for (const suite of suites) {
  process.stdout.write(`${suite.padEnd(20)} `);
  const result = await run(suite);
  results.push(result);
  console.log(
    result.code === 0
      ? `${result.passed} passed  (${(result.ms / 1000).toFixed(1)}s)`
      : `${result.passed} passed, ${result.failed} FAILED  (${(result.ms / 1000).toFixed(1)}s)`,
  );
}

const broken = results.filter((r) => r.code !== 0);
if (broken.length > 0) {
  for (const result of broken) {
    console.log(`\n${'─'.repeat(60)}\n${result.suite}\n${'─'.repeat(60)}`);
    // Only the failures and whatever the process said on the way out.
    const lines = result.output.split('\n').filter((line) => !line.startsWith('PASS'));
    console.log(lines.join('\n').trim());
  }
}

const passed = results.reduce((total, r) => total + r.passed, 0);
const failed = results.reduce((total, r) => total + r.failed, 0);
console.log(`\n${passed} passed, ${failed} failed, across ${results.length} suites`);
process.exit(broken.length > 0 ? 1 : 0);
