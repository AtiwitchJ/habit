import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HabitRecord, LogRecord } from '../src/repo.ts';
import { computeHabitStats } from '../src/summary.ts';

test('computeHabitStats computes streak, total completions, and 30d completion rate', () => {
  const habit: HabitRecord = {
    id: 'h1',
    name: 'Read',
    kind: 'boolean',
    target: 1,
    schedule: { type: 'daily' },
    startDate: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const logs: LogRecord[] = [
    { id: 'l1', habitId: 'h1', logicalDate: '2026-10-30', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
    { id: 'l2', habitId: 'h1', logicalDate: '2026-10-31', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
    { id: 'l3', habitId: 'h1', logicalDate: '2026-11-01', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
  ];
  const stats = computeHabitStats(habit, logs, '2026-11-01');
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.totalCompletions, 3);
  assert.ok(stats.completionRate30d > 0);
});
