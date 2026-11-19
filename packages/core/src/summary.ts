import { addDays, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, LogRecord } from './repo.ts';
import { evaluateStreak, isDue, type StreakResult } from './streak.ts';
import { computeHabitStrength, type HabitStrengthSummary } from './habit-strength.ts';

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
  strength: HabitStrengthSummary;
}

export function summarize(habit: HabitRecord, logs: LogRecord[], date: LogicalDate, today: LogicalDate): HabitSummary {
  const relapsed = logs.some((log) => !log.deletedAt && log.kind === 'relapse' && log.logicalDate === date);
  const value = logs
    .filter((log) => !log.deletedAt && log.kind === 'complete' && log.logicalDate === date)
    .reduce((sum, log) => sum + log.value, 0);
  return {
    due: isDue(habit.schedule, date),
    value,
    done: habit.quit ? !relapsed : value >= habit.target,
    streak: evaluateStreak({ startDate: habit.startDate, target: habit.target, schedule: habit.schedule, quit: habit.quit }, logs, today),
  };
}

export function computeHabitStats(habit: HabitRecord, logs: LogRecord[], today: LogicalDate): HabitDetailStats {
  const streak = evaluateStreak({ startDate: habit.startDate, target: habit.target, schedule: habit.schedule, quit: habit.quit }, logs, today);

  const byDate = new Map<LogicalDate, number>();
  for (const log of logs) {
    if (log.deletedAt || log.kind !== 'complete') continue;
    byDate.set(log.logicalDate, (byDate.get(log.logicalDate) ?? 0) + log.value);
  }

  const relapsedDates = new Set(logs.filter((log) => !log.deletedAt && log.kind === 'relapse').map((log) => log.logicalDate));
  // Quit habits have no completions: every non-relapse day since start is a win.
  const isWin = (date: LogicalDate, sum: number) => (habit.quit ? !relapsedDates.has(date) : sum >= habit.target);

  let totalCompletions = 0;
  if (habit.quit) {
    for (let d = habit.startDate; d <= today; d = addDays(d, 1)) if (isWin(d, 0)) totalCompletions++;
  } else {
    for (const [date, sum] of byDate.entries()) {
      if (date >= habit.startDate && date <= today && isWin(date, sum)) totalCompletions++;
    }
  }

  let dueDays30d = 0;
  let doneDays30d = 0;
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    if (d < habit.startDate) continue;
    if (isDue(habit.schedule, d)) {
      dueDays30d++;
      if (isWin(d, byDate.get(d) ?? 0)) {
        doneDays30d++;
      }
    }
  }

  const completionRate30d = dueDays30d > 0 ? Math.round((doneDays30d / dueDays30d) * 100) : 0;

  const strength = computeHabitStrength(
    { startDate: habit.startDate, target: habit.target, schedule: habit.schedule, quit: habit.quit },
    logs,
    today,
  );

  return {
    currentStreak: streak.current,
    longestStreak: streak.longest,
    totalCompletions,
    completionRate30d,
    strength,
  };
}

