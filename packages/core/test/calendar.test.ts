import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays } from '../src/calendar.ts';

test('month calendar starts Monday and covers the complete month', () => {
  const days = calendarDays('2024-02-17', 'month');
  assert.equal(days[0], '2024-01-29');
  assert.equal(days.at(-1), '2024-03-03');
  assert.equal(days.length, 35);
  assert.ok(days.includes('2024-02-29'));
});

test('week calendar crosses years and uses Monday as the first day', () => {
  assert.deepEqual(calendarDays('2025-01-01', 'week'), ['2024-12-30', '2024-12-31', '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05']);
});

import { rangeStats } from '../src/calendar.ts';
import type { HabitRecord, LogRecord } from '../src/repo.ts';

const habit = (over: Partial<HabitRecord>): HabitRecord => ({
  id: 'h', name: 'H', kind: 'boolean', target: 1, schedule: { type: 'daily' }, startDate: '2026-10-01', createdAt: 'x', updatedAt: 'x', ...over,
});
const log = (habitId: string, logicalDate: string, over: Partial<LogRecord> = {}): LogRecord => ({
  id: logicalDate + habitId, habitId, logicalDate, kind: 'complete', value: 1, occurredAt: 'x', isRetroactive: false, createdAt: 'x', ...over,
});

test('rangeStats: counts due vs done per habit-day, ignores future, pre-start, excused and empty ranges', () => {
  const a = habit({ id: 'a' });
  const q = habit({ id: 'q', quit: true });
  const logs = { a: [log('a', '2026-10-02'), log('a', '2026-10-03', { kind: 'skip', value: 0 })], q: [log('q', '2026-10-02', { kind: 'relapse', value: 0 })] };
  // Oct 1-4 with today Oct 3: a due 3 days, skip excused -> 2 due, 1 done. q: 3 due, relapse on 2nd -> 2 done.
  assert.deepEqual(rangeStats([a, q], logs, '2026-10-01', '2026-10-04', '2026-10-03'), { due: 5, done: 3, rate: 60, activeDays: 3 });
  assert.deepEqual(rangeStats([a], {}, '2026-09-01', '2026-09-30', '2026-10-03'), { due: 0, done: 0, rate: 0, activeDays: 0 });
});
