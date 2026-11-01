import { addDays, startOfIsoWeek, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, LogRecord } from './repo.ts';
import { isDue } from './streak.ts';

export function calendarDays(date: LogicalDate, view: 'day' | 'week' | 'month'): LogicalDate[] {
  if (view === 'day') return [date];
  const first = view === 'week' ? date : `${date.slice(0, 7)}-01`;
  const start = startOfIsoWeek(first);
  const end = view === 'week' ? addDays(start, 6) : addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1);
  const days: LogicalDate[] = [];
  for (let day = start; day <= end || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}

export interface RangeStats {
  due: number; // habit-days that were due and not excused
  done: number;
  rate: number; // 0 to 100
  activeDays: number; // days with at least one finished habit
}

// Aggregate over [from, to] clipped to today. times_per_* goals count per day like any habit: a day is
// done when that day's own target is met.
export function rangeStats(habits: HabitRecord[], logs: Record<string, LogRecord[]>, from: LogicalDate, to: LogicalDate, today: LogicalDate): RangeStats {
  let due = 0;
  let done = 0;
  let activeDays = 0;
  for (let day = from; day <= to && day <= today; day = addDays(day, 1)) {
    let any = false;
    for (const habit of habits) {
      if (habit.deletedAt || habit.startDate > day || !isDue(habit.schedule, day)) continue;
      const rows = (logs[habit.id] ?? []).filter((log) => !log.deletedAt && log.logicalDate === day);
      if (rows.some((log) => log.kind === 'skip' || log.kind === 'freeze')) continue;
      due++;
      const total = rows.filter((log) => log.kind === 'complete').reduce((sum, log) => sum + log.value, 0);
      if (habit.quit ? !rows.some((log) => log.kind === 'relapse') : total >= habit.target) {
        done++;
        any = true;
      }
    }
    if (any) activeDays++;
  }
  return { due, done, rate: due ? Math.round((done / due) * 100) : 0, activeDays };
}
