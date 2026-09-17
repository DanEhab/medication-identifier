// When the app has to admit a reminder will not arrive.
//
// Setting a time asks Android for permission, and the answer is a system
// dialog the app does not control. Say no to it — or miss it, which is easy,
// because the time is already saved and sitting on the card behind it — and
// every reminder is dropped while the screen goes on showing the times as
// though they were set. That is a failure somebody discovers by missing a
// dose, so the rule for owning up to it is worth testing on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/*
  Only the decision is compiled, not the module: reminders.ts imports the
  Capacitor plugin at the top, which needs a browser and a phone behind it.
  The rule is pure, so it is lifted out and compiled alone rather than mocked
  — a mock of Capacitor would be a second thing to keep true.
*/
const source = readFileSync(fileURLToPath(new URL('../src/lib/reminders.ts', import.meta.url)), 'utf8');
const start = source.indexOf('export const shouldWarnRemindersOff');
const end = source.indexOf('};', start) + 2;
const { outputText } = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { shouldWarnRemindersOff } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const withTimes = [{ schedule: { times: ['08:00'], note: '' } }];
const withoutTimes = [{ schedule: { times: [], note: 'after dinner' } }, {}];

test('a refused permission with a time set is warned about', () => {
  assert.equal(shouldWarnRemindersOff('denied', withTimes), true);
});

test('so is one that has not been answered yet', () => {
  // The dialog can be dismissed by tapping away from it, which leaves the
  // permission unanswered and the reminder just as undelivered.
  assert.equal(shouldWarnRemindersOff('prompt', withTimes), true);
});

test('a granted permission is not', () => {
  assert.equal(shouldWarnRemindersOff('granted', withTimes), false);
});

test('and no warning where there are no notifications to refuse', () => {
  // The browser build. Warning there would be telling somebody to fix
  // something that does not exist on the thing they are using.
  assert.equal(shouldWarnRemindersOff('unavailable', withTimes), false);
});

test('nothing is said when no time has been set', () => {
  // Refused permission is only a problem once somebody wants a reminder.
  assert.equal(shouldWarnRemindersOff('denied', withoutTimes), false);
  assert.equal(shouldWarnRemindersOff('prompt', []), false);
});

test('one medicine with a time is enough to warn', () => {
  assert.equal(shouldWarnRemindersOff('denied', [...withoutTimes, ...withTimes]), true);
});
