import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStreak, type HabitRule, type LogRow } from '../src/streak.ts';

const done = (logicalDate: string): LogRow => ({ logicalDate, kind: 'complete', value: 1 });

test('times_per_month: month needs count; open current month does not break', () => {
  const rule: HabitRule = { startDate: '2026-08-01', target: 1, schedule: { type: 'times_per_month', count: 2 } };
  // Aug done (2), Sep missed (1), Oct open (1 of 2).
  const logs = [done('2026-08-03'), done('2026-08-20'), done('2026-09-10'), done('2026-10-05')];
  assert.deepEqual(evaluateStreak(rule, logs, '2026-10-30'), { current: 0, longest: 1 });
  assert.deepEqual(evaluateStreak(rule, [...logs, done('2026-09-11')], '2026-10-30'), { current: 2, longest: 2 });
});

test('times_per_month: a partial first month is not evaluated', () => {
  const rule: HabitRule = { startDate: '2026-09-20', target: 1, schedule: { type: 'times_per_month', count: 3 } };
  assert.deepEqual(evaluateStreak(rule, [done('2026-10-01'), done('2026-10-02'), done('2026-10-03')], '2026-11-02'), { current: 1, longest: 1 });
});

test('times_per_year: year needs count, leap year included', () => {
  const rule: HabitRule = { startDate: '2024-01-01', target: 1, schedule: { type: 'times_per_year', count: 2 } };
  const logs = [done('2024-02-29'), done('2024-12-31'), done('2025-03-01')];
  assert.deepEqual(evaluateStreak(rule, logs, '2025-06-01'), { current: 1, longest: 1 }); // 2024 done, 2025 open
  assert.deepEqual(evaluateStreak(rule, logs, '2026-01-02'), { current: 0, longest: 1 }); // 2025 missed
});

test('quit habit: clean days count until a relapse resets the streak', () => {
  const rule: HabitRule = { startDate: '2026-10-01', target: 1, schedule: { type: 'daily' }, quit: true };
  assert.deepEqual(evaluateStreak(rule, [], '2026-10-10'), { current: 10, longest: 10 });
  const relapse: LogRow = { logicalDate: '2026-10-04', kind: 'relapse', value: 0 };
  assert.deepEqual(evaluateStreak(rule, [relapse], '2026-10-10'), { current: 6, longest: 6 });
  assert.deepEqual(evaluateStreak(rule, [{ ...relapse, deletedAt: 'x' }], '2026-10-10'), { current: 10, longest: 10 });
});

import { createMemoryRepo } from '../src/repo.ts';
import { clearRelapse, relapse } from '../src/checkin.ts';
import { computeHabitStats, summarize } from '../src/summary.ts';

test('quit habit: relapse flips the day, clearRelapse restores it, stats count clean days', async () => {
  const NOW = new Date('2026-10-10T10:00:00Z');
  const repo = createMemoryRepo({ now: () => NOW });
  const habit = await repo.addHabit({ name: 'No sugar', kind: 'boolean', quit: true, target: 1, schedule: { type: 'daily' }, startDate: '2026-10-01' });
  const sum = async () => summarize(habit, await repo.listLogs(habit.id), '2026-10-10', '2026-10-10');
  assert.deepEqual({ done: (await sum()).done, current: (await sum()).streak.current }, { done: true, current: 10 });
  await relapse(repo, habit, '2026-10-10', '2026-10-10', 'cheat day', NOW);
  assert.deepEqual({ done: (await sum()).done, current: (await sum()).streak.current }, { done: false, current: 0 });
  assert.equal(computeHabitStats(habit, await repo.listLogs(habit.id), '2026-10-10').totalCompletions, 9);
  await clearRelapse(repo, habit, '2026-10-10');
  assert.equal((await sum()).done, true);
});
