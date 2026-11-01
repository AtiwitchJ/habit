import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoWeekday, toLogicalDate, type DayBoundary } from '../src/logical-date.ts';
import { evaluateStreak, type HabitRule, type LogRow } from '../src/streak.ts';
import { HABIT_TEMPLATES } from '../src/templates.ts';

const BANGKOK_4AM: DayBoundary = { timeZone: 'Asia/Bangkok', rolloverMinutes: 240 };
const NEW_YORK_4AM: DayBoundary = { timeZone: 'America/New_York', rolloverMinutes: 240 };
const UTC_MIDNIGHT: DayBoundary = { timeZone: 'UTC', rolloverMinutes: 0 };

const done = (logicalDate: string, value = 1): LogRow => ({ logicalDate, kind: 'complete', value });
const freeze = (logicalDate: string): LogRow => ({ logicalDate, kind: 'freeze', value: 0 });

test('rollover: before 04:00 local belongs to previous logical day', () => {
  // 2026-11-01T20:59Z = 2026-11-02 03:59 Bangkok (UTC+7)
  assert.equal(toLogicalDate(Date.parse('2026-11-01T20:59:00Z'), BANGKOK_4AM), '2026-11-01');
  // 21:00Z = 04:00 Bangkok
  assert.equal(toLogicalDate(Date.parse('2026-11-01T21:00:00Z'), BANGKOK_4AM), '2026-11-02');
});

test('same instant, different zones, different logical dates (travel)', () => {
  const instant = Date.parse('2026-11-01T22:00:00Z'); // 05:00 Bangkok on Nov 2, 18:00 New York on Nov 1
  assert.equal(toLogicalDate(instant, BANGKOK_4AM), '2026-11-02');
  assert.equal(toLogicalDate(instant, NEW_YORK_4AM), '2026-11-01');
});

test('midnight rollover and DST fall-back wall clock', () => {
  assert.equal(toLogicalDate(Date.parse('2026-10-31T23:59:00Z'), UTC_MIDNIGHT), '2026-10-31');
  assert.equal(toLogicalDate(Date.parse('2026-11-01T00:00:00Z'), UTC_MIDNIGHT), '2026-11-01');
  // New York falls back at 06:00Z on Nov 1. 05:30Z is 01:30 EDT, before the 04:00 rollover.
  assert.equal(toLogicalDate(Date.parse('2026-11-01T05:30:00Z'), NEW_YORK_4AM), '2026-10-31');
});

test('calendar helpers', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(isoWeekday('2026-11-01'), 7); // Sunday
  assert.equal(isoWeekday('2026-10-26'), 1); // Monday
});

test('invalid input throws', () => {
  assert.throws(() => toLogicalDate(Date.now(), { timeZone: 'Mars/Olympus', rolloverMinutes: 0 }), RangeError);
  assert.throws(() => toLogicalDate(Date.now(), { timeZone: 'UTC', rolloverMinutes: 1440 }), RangeError);
  assert.throws(() => toLogicalDate(NaN, UTC_MIDNIGHT), RangeError);
});

test('daily: missed yesterday breaks streak; today open does not', () => {
  const rule: HabitRule = { startDate: '2026-10-27', target: 1, schedule: { type: 'daily' } };
  const logs = [done('2026-10-27'), done('2026-10-28')];
  assert.deepEqual(evaluateStreak(rule, logs, '2026-10-30'), { current: 0, longest: 2 });
});

test('daily: freeze bridges a gap without adding; retroactive check-in extends', () => {
  const rule: HabitRule = { startDate: '2026-10-27', target: 1, schedule: { type: 'daily' } };
  const withFreeze = [done('2026-10-27'), done('2026-10-28'), freeze('2026-10-29'), done('2026-10-30')];
  assert.deepEqual(evaluateStreak(rule, withFreeze, '2026-10-30'), { current: 3, longest: 3 });

  const retro = [done('2026-10-27'), done('2026-10-28'), done('2026-10-30'), done('2026-10-29')];
  assert.deepEqual(evaluateStreak(rule, retro, '2026-10-30'), { current: 4, longest: 4 });
});

test('weekdays: non-due days never break; deleted logs ignored', () => {
  const rule: HabitRule = { startDate: '2026-10-19', target: 1, schedule: { type: 'weekdays', days: [1, 3, 5] } };
  const logs = [done('2026-10-19'), done('2026-10-21'), done('2026-10-23'), done('2026-10-26'), done('2026-10-28')];
  assert.deepEqual(evaluateStreak(rule, logs, '2026-10-30'), { current: 5, longest: 5 });

  const missedMonday = logs.filter((log) => log.logicalDate !== '2026-10-26');
  assert.deepEqual(evaluateStreak(rule, missedMonday, '2026-10-30'), { current: 1, longest: 3 });

  const deleted = [{ ...done('2026-10-28'), deletedAt: '2026-10-29T00:00:00Z' }];
  assert.deepEqual(evaluateStreak(rule, deleted, '2026-10-30'), { current: 0, longest: 0 });
});

test('quantitative: amounts sum per day, partial does not count', () => {
  const rule: HabitRule = { startDate: '2026-10-29', target: 2000, schedule: { type: 'daily' } };
  const logs = [done('2026-10-29', 1200), done('2026-10-29', 800), done('2026-10-30', 1200)];
  assert.deepEqual(evaluateStreak(rule, logs, '2026-10-30'), { current: 1, longest: 1 });
});

test('times_per_week: week needs count; open current week does not break', () => {
  const rule: HabitRule = { startDate: '2026-10-12', target: 1, schedule: { type: 'times_per_week', count: 3 } };
  // Week of Oct 12 done. Week of Oct 19 has 2 of 3 (missed). Current week Oct 26 has 1 (open).
  const logs = [done('2026-10-12'), done('2026-10-14'), done('2026-10-16'), done('2026-10-19'), done('2026-10-21'), done('2026-10-26')];
  assert.deepEqual(evaluateStreak(rule, logs, '2026-10-30'), { current: 0, longest: 1 });

  // Third completion in Oct 19 week: two weeks done, current week still open.
  assert.deepEqual(evaluateStreak(rule, [...logs, done('2026-10-22')], '2026-10-30'), { current: 2, longest: 2 });
});

test('templates: valid, unique, and accepted by the streak engine', () => {
  const ids = new Set<string>();
  for (const t of HABIT_TEMPLATES) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.target > 0, t.id);
    assert.equal(t.kind === 'quantitative', t.unit !== undefined, `${t.id}: unit iff quantitative`);
    if (t.kind === 'boolean') assert.equal(t.target, 1, t.id);
    if (t.reminderTime) assert.match(t.reminderTime, /^([01]\d|2[0-3]):[0-5]\d$/, t.id);
    if (t.schedule.type === 'weekdays') {
      assert.ok(t.schedule.days.length > 0 && t.schedule.days.every((d) => d >= 1 && d <= 7), t.id);
    }
    if (t.schedule.type === 'times_per_week') {
      assert.ok(t.schedule.count >= 1 && t.schedule.count <= 7, t.id);
    }
    assert.doesNotThrow(() => evaluateStreak({ startDate: '2026-10-01', target: t.target, schedule: t.schedule }, [], '2026-10-30'), t.id);
  }
});
