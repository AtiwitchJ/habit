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
