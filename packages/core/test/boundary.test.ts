import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeBoundary } from '../src/logical-date.ts';
import { isDue } from '../src/streak.ts';

test('safeBoundary keeps valid input', () => {
  assert.deepEqual(safeBoundary('Asia/Bangkok', 240), { boundary: { timeZone: 'Asia/Bangkok', rolloverMinutes: 240 } });
});

test('safeBoundary falls back on bad timezone or rollover', () => {
  for (const [tz, minutes] of [['Mars/Olympus', 240], ['UTC', 1440], ['UTC', -1], ['UTC', 1.5]] as const) {
    const result = safeBoundary(tz, minutes);
    assert.deepEqual(result.boundary, { timeZone: 'UTC', rolloverMinutes: 0 });
    assert.ok(result.warning);
  }
});

test('isDue', () => {
  assert.equal(isDue({ type: 'daily' }, '2026-10-30'), true);
  assert.equal(isDue({ type: 'times_per_week', count: 3 }, '2026-10-30'), true);
  const mwf = { type: 'weekdays', days: [1, 3, 5] } as const;
  assert.equal(isDue(mwf, '2026-10-30'), true); // Friday
  assert.equal(isDue(mwf, '2026-10-31'), false); // Saturday
});
