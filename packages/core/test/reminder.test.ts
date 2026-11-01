import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRemind } from '../src/reminder.ts';
import type { HabitRecord, LogRecord } from '../src/repo.ts';

const habit: HabitRecord = { id: 'h', name: 'Read', kind: 'boolean', target: 1, schedule: { type: 'weekdays', days: [1] }, startDate: '2026-10-01', reminderTime: '08:30', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const log: LogRecord = { id: 'l', habitId: 'h', logicalDate: '2026-11-02', kind: 'complete', value: 1, occurredAt: '2026-11-02T00:00:00Z', isRetroactive: false, createdAt: '2026-11-02T00:00:00Z' };

test('reminders only fire at the set time for due, unfinished and active habits', () => {
  assert.equal(shouldRemind(habit, [], '2026-11-02', '08:30'), true);
  assert.equal(shouldRemind(habit, [], '2026-11-02', '08:31'), false);
  assert.equal(shouldRemind(habit, [], '2026-11-03', '08:30'), false);
  assert.equal(shouldRemind(habit, [log], '2026-11-02', '08:30'), false);
  assert.equal(shouldRemind(habit, [{ ...log, kind: 'skip', value: 0 }], '2026-11-02', '08:30'), false);
  assert.equal(shouldRemind({ ...habit, archivedAt: '2026-11-01' }, [], '2026-11-02', '08:30'), false);
  assert.equal(shouldRemind({ ...habit, startDate: '2026-11-03' }, [], '2026-11-02', '08:30'), false);
  assert.equal(shouldRemind(habit, [{ ...log, deletedAt: '2026-11-02' }], '2026-11-02', '08:30'), true);
});

test('multiple reminder times override the legacy time, including an empty list', () => {
  const multiple = { ...habit, reminderTimes: ['08:30', '20:00'] };
  assert.equal(shouldRemind(multiple, [], '2026-11-02', '20:00'), true);
  assert.equal(shouldRemind({ ...multiple, reminderTimes: [] }, [], '2026-11-02', '08:30'), false);
});
