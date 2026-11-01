import type { LogicalDate } from './logical-date.ts';
import type { HabitRecord, LogRecord } from './repo.ts';
import { isDue } from './streak.ts';

export function shouldRemind(habit: HabitRecord, logs: LogRecord[], date: LogicalDate, time: string): boolean {
  if (habit.deletedAt || habit.archivedAt || habit.startDate > date || !(habit.reminderTimes ?? [habit.reminderTime]).includes(time) || !isDue(habit.schedule, date)) return false;
  const today = logs.filter((log) => !log.deletedAt && log.logicalDate === date);
  return !today.some((log) => log.kind === 'skip' || log.kind === 'freeze') &&
    today.filter((log) => log.kind === 'complete').reduce((sum, log) => sum + log.value, 0) < habit.target;
}
