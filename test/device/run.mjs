// Runs every device suite against the app installed on a connected device.
//
//   npm run test:device
//
// These talk to the real backend. They are slower and they cost Gemini calls,
// which is why they are a separate command from the browser suites rather than
// part of `npm test`: what they prove is that the whole chain works on Android,
// not that a component renders.
//
// Before running:
//   npm run build && npx cap sync android
//   (build and install the debug APK, or use Android Studio)

import { spawn, execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ID = 'com.danehab.medicationidentifier';

const suites = readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && !name.startsWith('_') && name !== 'run.mjs')
  .sort();

const adb = (args) => execSync(`adb ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

try {
  // Trim each line first: adb's output is CRLF on Windows, so a $-anchored
  // match on "\tdevice" never fires and a connected phone reads as no phone.
  const devices = adb('devices')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\tdevice$/.test(line));
  if (devices.length === 0) throw new Error('none');
  console.log(`device: ${devices[0].split('\t')[0]}\n`);
} catch {
  console.error(
    'No device is connected.\n' +
    'Start an emulator or plug a phone in, then install the debug build.\n' +
    'adb must be on PATH (Android SDK platform-tools).',
  );
  process.exit(1);
}

/**
 * Restarts the app and forwards its WebView debugger.
 *
 * Every suite needs a fresh one: the debugger port belongs to a particular
 * WebView process, and a suite that reloaded the page has left the previous
 * forward pointing at nothing.
 */
const attach = () => {
  adb(`shell am force-stop ${APP_ID}`);
  try { adb('forward --remove-all'); } catch { /* nothing forwarded yet */ }
  adb(`shell am start -n ${APP_ID}/.MainActivity`);

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const sockets = adb('shell cat /proc/net/unix');
      const match = sockets.match(/webview_devtools_remote_\d+/);
      if (match) {
        adb(`forward tcp:9333 localabstract:${match[0]}`);
        return match[0];
      }
    } catch { /* the app is still starting */ }
    execSync('node -e "setTimeout(()=>{},250)"');
  }
  return null;
};

const run = (suite) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(HERE, suite)], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  // The dark suite needs the phone itself in night mode; the rest expect day.
  const wantsNight = suite === 'dark.mjs';
  try { adb(`shell cmd uimode night ${wantsNight ? 'yes' : 'no'}`); } catch { /* older image */ }

  if (!attach()) {
    console.log(`${suite.padEnd(20)} could not attach to the WebView`);
    results.push({ suite, code: 1, passed: 0, failed: 1, output: 'no WebView' });
    continue;
  }

  process.stdout.write(`${suite.padEnd(20)} `);
  const result = await run(suite);
  results.push(result);
  console.log(
    result.code === 0
      ? `${result.passed} passed  (${(result.ms / 1000).toFixed(1)}s)`
      : `${result.passed} passed, ${result.failed} FAILED  (${(result.ms / 1000).toFixed(1)}s)`,
  );
}

// Leave the phone as it was found.
try { adb('shell cmd uimode night no'); } catch { /* older image */ }

const broken = results.filter((r) => r.code !== 0);
for (const result of broken) {
  console.log(`\n${'─'.repeat(60)}\n${result.suite}\n${'─'.repeat(60)}`);
  console.log(result.output.split('\n').filter((line) => !line.startsWith('PASS')).join('\n').trim());
}

const passed = results.reduce((total, r) => total + r.passed, 0);
const failed = results.reduce((total, r) => total + r.failed, 0);
console.log(`\n${passed} passed, ${failed} failed, across ${results.length} suites`);
process.exit(broken.length > 0 ? 1 : 0);
