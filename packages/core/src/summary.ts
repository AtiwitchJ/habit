import type { LogicalDate } from './logical-date.ts';
import type { HabitRecord, LogRecord } from './repo.ts';
import { evaluateStreak, isDue, type StreakResult } from './streak.ts';

export interface HabitSummary {
  due: boolean;
  value: number; // completed amount on `date`
  done: boolean; // value >= target on `date`
  streak: StreakResult; // as of `today`
}

export function summarize(habit: HabitRecord, logs: LogRecord[], date: LogicalDate, today: LogicalDate): HabitSummary {
  const value = logs
    .filter((log) => !log.deletedAt && log.kind === 'complete' && log.logicalDate === date)
    .reduce((sum, log) => sum + log.value, 0);
  return {
    due: isDue(habit.schedule, date),
    value,
    done: value >= habit.target,
    streak: evaluateStreak({ startDate: habit.startDate, target: habit.target, schedule: habit.schedule }, logs, today),
  };
}
