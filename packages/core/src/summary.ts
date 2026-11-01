import { addDays, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, LogRecord } from './repo.ts';
import { evaluateStreak, isDue, type StreakResult } from './streak.ts';

export interface HabitSummary {
  due: boolean;
  value: number; // completed amount on `date`
  done: boolean; // value >= target on `date`
  streak: StreakResult; // as of `today`
}

export interface HabitDetailStats {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate30d: number; // 0 to 100
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

export function computeHabitStats(habit: HabitRecord, logs: LogRecord[], today: LogicalDate): HabitDetailStats {
  const streak = evaluateStreak({ startDate: habit.startDate, target: habit.target, schedule: habit.schedule }, logs, today);

  const byDate = new Map<LogicalDate, number>();
  for (const log of logs) {
    if (log.deletedAt || log.kind !== 'complete') continue;
    byDate.set(log.logicalDate, (byDate.get(log.logicalDate) ?? 0) + log.value);
  }

  let totalCompletions = 0;
  for (const [date, sum] of byDate.entries()) {
    if (date >= habit.startDate && date <= today && sum >= habit.target) {
      totalCompletions++;
    }
  }

  let dueDays30d = 0;
  let doneDays30d = 0;
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < habit.startDate) continue;
    if (isDue(habit.schedule, d)) {
      dueDays30d++;
      if ((byDate.get(d) ?? 0) >= habit.target) {
        doneDays30d++;
      }
    }
  }

  const completionRate30d = dueDays30d > 0 ? Math.round((doneDays30d / dueDays30d) * 100) : 0;

  return {
    currentStreak: streak.current,
    longestStreak: streak.longest,
    totalCompletions,
    completionRate30d,
  };
}

