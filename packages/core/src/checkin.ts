import { daysBetween, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, HabitRepo } from './repo.ts';

export const RETRO_DAYS = 30;

// One tap adds this much. Boolean habits: 1. Quantitative: the habit's own step, else about a tenth of the target.
export function stepFor(habit: Pick<HabitRecord, 'kind' | 'target' | 'step'>): number {
  if (habit.kind === 'boolean') return 1;
  return habit.step ?? Math.max(1, Math.round(habit.target / 10));
}

export function canLog(habit: Pick<HabitRecord, 'startDate'>, date: LogicalDate, today: LogicalDate): boolean {
  return date >= habit.startDate && date <= today && daysBetween(date, today) <= RETRO_DAYS;
}

export async function checkIn(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, now: Date = new Date()): Promise<void> {
  if (!canLog(habit, date, today)) throw new RangeError(`Cannot log ${date} for habit ${habit.id}`);
  await repo.addLog({
    habitId: habit.id,
    logicalDate: date,
    kind: 'complete',
    value: stepFor(habit),
    occurredAt: now.toISOString(),
    isRetroactive: date < today,
  });
}

// Removes the most recent completion on `date` (undo one step).
export async function undoCheckIn(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void> {
  const last = (await repo.listLogs(habit.id)).filter((log) => log.kind === 'complete' && log.logicalDate === date).at(-1);
  if (last) await repo.removeLog(last.id);
}

// Removes every completion on `date` (boolean un-check).
export async function clearDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void> {
  for (const log of await repo.listLogs(habit.id)) {
    if (log.kind === 'complete' && log.logicalDate === date) await repo.removeLog(log.id);
  }
}
