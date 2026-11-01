import { daysBetween, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, HabitRepo } from './repo.ts';

export const RETRO_DAYS = 30;
const pendingCheckIns = new WeakMap<HabitRepo, Promise<void>>();

// One tap adds this much. Boolean habits: 1. Quantitative: the habit's own step, else about a tenth of the target.
export function stepFor(habit: Pick<HabitRecord, 'kind' | 'target' | 'step'>): number {
  if (habit.kind === 'boolean') return 1;
  return habit.step ?? Math.max(1, Math.round(habit.target / 10));
}

export function canLog(habit: Pick<HabitRecord, 'startDate'>, date: LogicalDate, today: LogicalDate): boolean {
  return date >= habit.startDate && date <= today && daysBetween(date, today) <= RETRO_DAYS;
}

export async function checkIn(
  repo: HabitRepo,
  habit: HabitRecord,
  date: LogicalDate,
  today: LogicalDate,
  now: Date = new Date(),
  note?: string,
  amount: number = stepFor(habit), // a timer logs its own minutes instead of one step
): Promise<void> {
  if (!canLog(habit, date, today)) throw new RangeError(`Cannot log ${date} for habit ${habit.id}`);
  const previous = pendingCheckIns.get(repo) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => addCheckIn(repo, habit, date, today, now, amount, note));
  pendingCheckIns.set(repo, current);
  try {
    await current;
  } finally {
    if (pendingCheckIns.get(repo) === current) pendingCheckIns.delete(repo);
  }
}

async function addCheckIn(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, now: Date, amount: number, note?: string): Promise<void> {
  const logs = await repo.listLogs(habit.id);
  const completed = logs.filter((log) => !log.deletedAt && log.kind === 'complete' && log.logicalDate === date)
    .reduce((sum, log) => sum + log.value, 0);
  const value = Math.min(amount, habit.target - completed);
  if (value <= 0) return;
  await repo.addLog({
    habitId: habit.id,
    logicalDate: date,
    kind: 'complete',
    value,
    note,
    occurredAt: now.toISOString(),
    isRetroactive: date < today,
  });
}

export async function skipDay(
  repo: HabitRepo,
  habit: HabitRecord,
  date: LogicalDate,
  today: LogicalDate,
  note?: string,
  now: Date = new Date(),
): Promise<void> {
  if (!canLog(habit, date, today)) throw new RangeError(`Cannot log ${date} for habit ${habit.id}`);
  await removeExcusedDay(repo, habit, date);
  await repo.addLog({
    habitId: habit.id,
    logicalDate: date,
    kind: 'skip',
    value: 0,
    note,
    occurredAt: now.toISOString(),
    isRetroactive: date < today,
  });
}

export async function freezeDay(
  repo: HabitRepo,
  habit: HabitRecord,
  date: LogicalDate,
  today: LogicalDate,
  note?: string,
  now: Date = new Date(),
): Promise<void> {
  if (!canLog(habit, date, today)) throw new RangeError(`Cannot log ${date} for habit ${habit.id}`);
  await removeExcusedDay(repo, habit, date);
  await repo.addLog({
    habitId: habit.id,
    logicalDate: date,
    kind: 'freeze',
    value: 0,
    note,
    occurredAt: now.toISOString(),
    isRetroactive: date < today,
  });
}

export async function removeExcusedDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void> {
  for (const log of await repo.listLogs(habit.id)) {
    if ((log.kind === 'skip' || log.kind === 'freeze') && log.logicalDate === date) {
      await repo.removeLog(log.id);
    }
  }
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

// Quit habits: marks `date` as a slip. Clears any skip/freeze first so the day has one state.
export async function relapse(
  repo: HabitRepo,
  habit: HabitRecord,
  date: LogicalDate,
  today: LogicalDate,
  note?: string,
  now: Date = new Date(),
): Promise<void> {
  if (!canLog(habit, date, today)) throw new RangeError(`Cannot log ${date} for habit ${habit.id}`);
  await removeExcusedDay(repo, habit, date);
  if ((await repo.listLogs(habit.id)).some((log) => log.kind === 'relapse' && log.logicalDate === date)) return;
  await repo.addLog({ habitId: habit.id, logicalDate: date, kind: 'relapse', value: 0, note, occurredAt: now.toISOString(), isRetroactive: date < today });
}

export async function clearRelapse(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void> {
  for (const log of await repo.listLogs(habit.id)) {
    if (log.kind === 'relapse' && log.logicalDate === date) await repo.removeLog(log.id);
  }
}
