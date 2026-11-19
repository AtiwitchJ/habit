import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/logical-date.ts';
import {
  calculateDecayMultiplier,
  calculateScheduleFrequency,
  computeHabitStrength,
  computeHabitStrengthSeries,
  getStrengthStatus,
} from '../src/habit-strength.ts';
import type { LogRow } from '../src/streak.ts';

test('calculateDecayMultiplier and frequency', () => {
  const dailyFreq = calculateScheduleFrequency({ type: 'daily' });
  assert.equal(dailyFreq, 1.0);

  const dailyAlpha = calculateDecayMultiplier({ type: 'daily' });
  // alpha = 0.5^(1/13) ≈ 0.9481394
  assert.ok(Math.abs(dailyAlpha - 0.9481394) < 0.0001);

  const weekdaysFreq = calculateScheduleFrequency({ type: 'weekdays', days: [1, 3, 5] });
  assert.equal(weekdaysFreq, 3 / 7);

  const weekdaysAlpha = calculateDecayMultiplier({ type: 'weekdays', days: [1, 3, 5] });
  // Higher alpha than daily, decaying slower on active steps
  assert.ok(weekdaysAlpha > dailyAlpha);
});

test('Loop Habit Tracker milestone benchmarks: 30d (~80%), 60d (~96%), 90d (~99%)', () => {
  const startDate = '2026-01-01';
  const logs: LogRow[] = [];

  // Generate 90 consecutive perfect days
  for (let i = 0; i < 90; i++) {
    logs.push({
      logicalDate: addDays(startDate, i),
      kind: 'complete',
      value: 1,
    });
  }

  // Check at Day 30
  const day30Date = addDays(startDate, 29); // 0-indexed, 30 days
  const strength30 = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' } },
    logs,
    day30Date,
  );
  // ~79.8%
  assert.ok(strength30.score >= 79 && strength30.score <= 81, `Day 30 score was ${strength30.score}`);
  assert.equal(strength30.status, 'strong');

  // Check at Day 60
  const day60Date = addDays(startDate, 59);
  const strength60 = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' } },
    logs,
    day60Date,
  );
  // ~95.9%
  assert.ok(strength60.score >= 95 && strength60.score <= 97, `Day 60 score was ${strength60.score}`);
  assert.equal(strength60.status, 'mastered');

  // Check at Day 90
  const day90Date = addDays(startDate, 89);
  const strength90 = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' } },
    logs,
    day90Date,
  );
  // ~99.2%
  assert.ok(strength90.score >= 99 && strength90.score <= 100, `Day 90 score was ${strength90.score}`);
  assert.equal(strength90.status, 'mastered');
});

test('Slip resilience: missing 1 day after 90 days drops to ~94%, NOT 0%', () => {
  const startDate = '2026-01-01';
  const logs: LogRow[] = [];

  // 90 days of perfect consistency
  for (let i = 0; i < 90; i++) {
    logs.push({
      logicalDate: addDays(startDate, i),
      kind: 'complete',
      value: 1,
    });
  }

  // Day 91 has NO completion log (missed day)
  const day91Date = addDays(startDate, 90);
  const strength91 = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' } },
    logs,
    day91Date,
  );

  // Score must remain robust (~94%), avoiding the "what-the-hell" collapse
  assert.ok(strength91.score >= 93.5 && strength91.score <= 94.5, `Missed day score was ${strength91.score}`);
  assert.equal(strength91.status, 'mastered');
  assert.equal(strength91.trend, 'falling');
  assert.ok(strength91.projectedMissScore < strength91.score);
});

test('Quantitative partial credit proportionally increments strength', () => {
  const startDate = '2026-01-01';
  // Target = 2000 ml water. User logs 1000 ml (50% progress) every day for 10 days
  const logs: LogRow[] = [];
  for (let i = 0; i < 10; i++) {
    logs.push({
      logicalDate: addDays(startDate, i),
      kind: 'complete',
      value: 1000,
    });
  }

  const strengthPartial = computeHabitStrength(
    { startDate, target: 2000, schedule: { type: 'daily' } },
    logs,
    addDays(startDate, 9),
  );

  // 100% full credit for 10 days
  const logsFull: LogRow[] = logs.map((l) => ({ ...l, value: 2000 }));
  const strengthFull = computeHabitStrength(
    { startDate, target: 2000, schedule: { type: 'daily' } },
    logsFull,
    addDays(startDate, 9),
  );

  // Partial score should be exactly ~50% of the full score
  assert.ok(Math.abs(strengthPartial.score - strengthFull.score * 0.5) < 0.2);
});

test('Rest days on weekday schedule do not decay habit strength', () => {
  // Habit scheduled only on Mondays (ISO day 1)
  const startDate = '2026-01-05'; // Monday
  const logs: LogRow[] = [
    { logicalDate: '2026-01-05', kind: 'complete', value: 1 },
  ];

  const series = computeHabitStrengthSeries(
    { startDate, target: 1, schedule: { type: 'weekdays', days: [1] } },
    logs,
    '2026-01-07', // Wednesday (rest day)
  );

  assert.equal(series.length, 3);
  // Monday has the initial score
  const monScore = series[0].score;
  assert.ok(monScore > 0);
  // Tuesday (rest day) score should equal Monday score (zero decay)
  assert.equal(series[1].score, monScore);
  // Wednesday (rest day) score should still equal Monday score
  assert.equal(series[2].score, monScore);
});

test('Quit habits: clean days build strength, relapse reduces but retains buffer', () => {
  const startDate = '2026-01-01';
  const logs: LogRow[] = [];

  // 30 clean days
  const strength30 = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' }, quit: true },
    logs,
    addDays(startDate, 29),
  );
  assert.ok(strength30.score >= 79 && strength30.score <= 81);

  // Relapse on Day 31
  logs.push({
    logicalDate: addDays(startDate, 30),
    kind: 'relapse',
    value: 1,
  });

  const strengthRelapse = computeHabitStrength(
    { startDate, target: 1, schedule: { type: 'daily' }, quit: true },
    logs,
    addDays(startDate, 30),
  );

  // Relapse lowers score according to EMA (~75%), but user still keeps their foundation!
  assert.ok(strengthRelapse.score >= 74 && strengthRelapse.score <= 77);
  assert.equal(strengthRelapse.status, 'strong');
});

test('getStrengthStatus maps score thresholds accurately', () => {
  assert.equal(getStrengthStatus(95).status, 'mastered');
  assert.equal(getStrengthStatus(75).status, 'strong');
  assert.equal(getStrengthStatus(45).status, 'building');
  assert.equal(getStrengthStatus(20).status, 'fragile');
});
