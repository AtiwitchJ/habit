import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../src/repo.ts';
import { checkIn } from '../src/checkin.ts';
import { isTimeUnit, parseTimer, remainingSeconds, elapsedSeconds, timerMinutes, type TimerState } from '../src/timer.ts';

const T0 = 1_000_000;

test('stopwatch counts up, countdown counts down and stops at zero', () => {
  const sw: TimerState = { mode: 'stopwatch', startedAt: T0 };
  const cd: TimerState = { mode: 'countdown', startedAt: T0, seconds: 600 };
  assert.equal(elapsedSeconds(sw, T0 + 90_000), 90);
  assert.equal(remainingSeconds(cd, T0 + 90_000), 510);
  assert.equal(remainingSeconds(cd, T0 + 700_000), 0);
  assert.equal(elapsedSeconds(sw, T0 - 5_000), 0); // clock moved back
});

test('timerMinutes rounds to whole minutes; countdown never exceeds its length; under 30s logs nothing', () => {
  assert.equal(timerMinutes({ mode: 'stopwatch', startedAt: T0 }, T0 + 29_000), 0);
  assert.equal(timerMinutes({ mode: 'stopwatch', startedAt: T0 }, T0 + 31_000), 1);
  assert.equal(timerMinutes({ mode: 'stopwatch', startedAt: T0 }, T0 + 25 * 60_000), 25);
  assert.equal(timerMinutes({ mode: 'countdown', startedAt: T0, seconds: 600 }, T0 + 3_600_000), 10);
});

test('isTimeUnit and parseTimer accept only sane input', () => {
  assert.ok(isTimeUnit('min') && isTimeUnit(' Minutes ') && isTimeUnit('นาที'));
  assert.ok(!isTimeUnit('ml') && !isTimeUnit(undefined));
  assert.deepEqual(parseTimer('{"mode":"countdown","startedAt":5,"seconds":60}'), { mode: 'countdown', startedAt: 5, seconds: 60 });
  assert.equal(parseTimer('{"mode":"countdown","startedAt":5}'), null);
  assert.equal(parseTimer('nope'), null);
  assert.equal(parseTimer(null), null);
});

test('a timer result is a normal check-in and is trimmed at the target', async () => {
  const repo = createMemoryRepo({ now: () => new Date('2026-10-30T10:00:00Z') });
  const habit = await repo.addHabit({ name: 'Read', kind: 'quantitative', target: 30, unit: 'min', schedule: { type: 'daily' }, startDate: '2026-10-29' });
  await checkIn(repo, habit, '2026-10-30', '2026-10-30', new Date(), 'timer', 25);
  await checkIn(repo, habit, '2026-10-30', '2026-10-30', new Date(), 'timer', 25);
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.value), [25, 5]);
});
