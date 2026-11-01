// Streak engine. Pure: same (rule, logs, today) always gives the same result.
// Retroactive check-ins and deleted logs need no special handling: logs are keyed by logical_date.

import { addDays, isoWeekday, startOfIsoWeek, type LogicalDate } from './logical-date.ts';

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // ISO weekdays 1..7
  | { type: 'times_per_week'; count: number }; // 1..7 completions per ISO week (Mon-Sun)

export interface HabitRule {
  startDate: LogicalDate;
  target: number; // boolean habit = 1; quantitative = e.g. 2000 (ml). Must be > 0.
  schedule: Schedule;
}

export interface LogRow {
  logicalDate: LogicalDate;
  kind: 'complete' | 'skip' | 'freeze';
  value: number; // amount for 'complete'; ignored for 'skip' and 'freeze'
  deletedAt?: string | null;
}

export interface StreakResult {
  current: number;
  longest: number;
}

// done: target met. excused: skip/freeze, neutral. open: today or current week, not decided yet.
// missed: breaks streak.
type UnitState = 'done' | 'excused' | 'open' | 'missed';

export function evaluateStreak(rule: HabitRule, logs: LogRow[], today: LogicalDate): StreakResult {
  if (!(rule.target > 0)) throw new RangeError('target must be > 0');

  const totals = new Map<LogicalDate, { value: number; excused: boolean }>();
  for (const log of logs) {
    if (log.deletedAt || log.logicalDate > today) continue;
    const total = totals.get(log.logicalDate) ?? { value: 0, excused: false };
    if (log.kind === 'complete') total.value += log.value;
    else total.excused = true;
    totals.set(log.logicalDate, total);
  }

  const dayState = (date: LogicalDate): UnitState => {
    const total = totals.get(date);
    if (total && total.value >= rule.target) return 'done';
    if (total?.excused) return 'excused';
    return date === today ? 'open' : 'missed';
  };

  const states: UnitState[] = [];
  const { schedule } = rule;

  if (schedule.type === 'times_per_week') {
    // Partial first week (habit started mid-week) is not evaluated.
    for (let week = startOfIsoWeek(rule.startDate); week <= today; week = addDays(week, 7)) {
      if (week < rule.startDate) continue;
      const weekEnd = addDays(week, 6);
      let done = 0;
      let excused = 0;
      for (let day = week; day <= weekEnd && day <= today; day = addDays(day, 1)) {
        const state = dayState(day);
        if (state === 'done') done++;
        else if (state === 'excused') excused++;
      }
      // Each excused day in the week lowers the required count by one.
      const required = Math.max(0, schedule.count - excused);
      if (required === 0) states.push('excused');
      else if (done >= required) states.push('done');
      else states.push(weekEnd >= today ? 'open' : 'missed');
    }
  } else {
    for (let day = rule.startDate; day <= today; day = addDays(day, 1)) {
      const due = schedule.type === 'daily' || schedule.days.includes(isoWeekday(day));
      if (due) states.push(dayState(day));
    }
  }

  let longest = 0;
  let run = 0;
  for (const state of states) {
    if (state === 'done') longest = Math.max(longest, ++run);
    else if (state === 'missed') run = 0;
  }

  // Walk back from newest unit. Open units are skipped, so today not yet done does not break the streak.
  let current = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i] === 'done') current++;
    else if (states[i] === 'missed') break;
  }

  return { current, longest };
}
