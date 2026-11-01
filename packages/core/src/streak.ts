// Streak engine. Pure: same (rule, logs, today) always gives the same result.
// Retroactive check-ins and deleted logs need no special handling: logs are keyed by logical_date.

import { addDays, isoWeekday, startOfIsoWeek, type LogicalDate } from './logical-date.ts';

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] } // ISO weekdays 1..7
  | { type: 'times_per_week'; count: number } // 1..7 completions per ISO week (Mon-Sun)
  | { type: 'times_per_month'; count: number } // 1..31 completions per calendar month
  | { type: 'times_per_year'; count: number }; // 1..366 completions per calendar year

export interface HabitRule {
  startDate: LogicalDate;
  target: number; // boolean habit = 1; quantitative = e.g. 2000 (ml). Must be > 0.
  schedule: Schedule;
  quit?: boolean; // quit habit: every day is clean unless a 'relapse' log says otherwise
}

export interface LogRow {
  logicalDate: LogicalDate;
  kind: 'complete' | 'skip' | 'freeze' | 'relapse';
  value: number; // amount for 'complete'; ignored for the other kinds
  deletedAt?: string | null;
}

export interface StreakResult {
  current: number;
  longest: number;
}

// done: target met. excused: skip/freeze, neutral. open: today or current week, not decided yet.
// missed: breaks streak.
type UnitState = 'done' | 'excused' | 'open' | 'missed';

// times_per_* are not tied to specific days, so every day counts as a day you can do it.
export function isDue(schedule: Schedule, date: LogicalDate): boolean {
  return schedule.type !== 'weekdays' || schedule.days.includes(isoWeekday(date));
}

// Label for one streak unit: a day, or the period of a times_per_* goal.
export function streakUnit(schedule: Schedule): 'd' | 'wk' | 'mo' | 'yr' {
  return schedule.type === 'times_per_week' ? 'wk' : schedule.type === 'times_per_month' ? 'mo' : schedule.type === 'times_per_year' ? 'yr' : 'd';
}

// Inclusive [start, end] of the week, month or year that contains `date`.
function periodOf(type: 'times_per_week' | 'times_per_month' | 'times_per_year', date: LogicalDate): [LogicalDate, LogicalDate] {
  if (type === 'times_per_week') {
    const start = startOfIsoWeek(date);
    return [start, addDays(start, 6)];
  }
  if (type === 'times_per_year') return [`${date.slice(0, 4)}-01-01`, `${date.slice(0, 4)}-12-31`];
  const start = `${date.slice(0, 7)}-01`;
  return [start, addDays(`${addDays(start, 32).slice(0, 7)}-01`, -1)];
}

export function evaluateStreak(rule: HabitRule, logs: LogRow[], today: LogicalDate): StreakResult {
  if (!(rule.target > 0)) throw new RangeError('target must be > 0');

  const totals = new Map<LogicalDate, { value: number; excused: boolean; relapsed: boolean }>();
  for (const log of logs) {
    if (log.deletedAt || log.logicalDate > today) continue;
    const total = totals.get(log.logicalDate) ?? { value: 0, excused: false, relapsed: false };
    if (log.kind === 'complete') total.value += log.value;
    else if (log.kind === 'relapse') total.relapsed = true;
    else total.excused = true;
    totals.set(log.logicalDate, total);
  }

  const dayState = (date: LogicalDate): UnitState => {
    const total = totals.get(date);
    if (rule.quit) return total?.relapsed ? 'missed' : 'done';
    if (total && total.value >= rule.target) return 'done';
    if (total?.excused) return 'excused';
    return date === today ? 'open' : 'missed';
  };

  const states: UnitState[] = [];
  const { schedule } = rule;

  if (schedule.type === 'times_per_week' || schedule.type === 'times_per_month' || schedule.type === 'times_per_year') {
    // Partial first period (habit started mid-period) is not evaluated.
    let [start, end] = periodOf(schedule.type, rule.startDate);
    for (; start <= today; [start, end] = periodOf(schedule.type, addDays(end, 1))) {
      if (start < rule.startDate) continue;
      let done = 0;
      let excused = 0;
      for (let day = start; day <= end && day <= today; day = addDays(day, 1)) {
        const state = dayState(day);
        if (state === 'done') done++;
        else if (state === 'excused') excused++;
      }
      // Each excused day in the period lowers the required count by one.
      const required = Math.max(0, schedule.count - excused);
      if (required === 0) states.push('excused');
      else if (done >= required) states.push('done');
      else states.push(end >= today ? 'open' : 'missed');
    }
  } else {
    for (let day = rule.startDate; day <= today; day = addDays(day, 1)) {
      if (isDue(schedule, day)) states.push(dayState(day));
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
