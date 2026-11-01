import { uuidv7 } from './ids.ts';
import type { LogicalDate } from './logical-date.ts';
import type { Schedule } from './streak.ts';

export interface HabitRecord {
  id: string;
  name: string;
  kind: 'boolean' | 'quantitative';
  target: number;
  unit?: string;
  schedule: Schedule;
  startDate: LogicalDate;
  templateId?: string;
  reminderTime?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LogRecord {
  id: string;
  habitId: string;
  logicalDate: LogicalDate;
  kind: 'complete' | 'skip' | 'freeze';
  value: number;
  occurredAt: string;
  isRetroactive: boolean;
  createdAt: string;
  deletedAt?: string | null;
}

export type NewHabit = Omit<HabitRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type NewLog = Omit<LogRecord, 'id' | 'createdAt' | 'deletedAt'>;
export type HabitPatch = Partial<Pick<HabitRecord, 'name' | 'target' | 'startDate' | 'reminderTime'>>;

// Async so a SQLite-backed repo can replace the in-memory one without touching the UI.
export interface HabitRepo {
  listHabits(): Promise<HabitRecord[]>;
  addHabit(input: NewHabit): Promise<HabitRecord>;
  updateHabit(id: string, patch: HabitPatch): Promise<HabitRecord>;
  removeHabit(id: string): Promise<void>;
  listLogs(habitId: string): Promise<LogRecord[]>;
  addLog(input: NewLog): Promise<LogRecord>;
  removeLog(id: string): Promise<void>;
}

export interface RepoState {
  habits: HabitRecord[];
  logs: LogRecord[];
}

export interface MemoryRepoOptions {
  seed?: RepoState;
  onChange?: (state: RepoState) => void;
  now?: () => Date;
}

export function createMemoryRepo(options: MemoryRepoOptions = {}): HabitRepo {
  const now = options.now ?? (() => new Date());
  const state: RepoState = options.seed ? structuredClone(options.seed) : { habits: [], logs: [] };
  const save = () => options.onChange?.(state);

  const liveHabit = (id: string): HabitRecord => {
    const habit = state.habits.find((h) => h.id === id && !h.deletedAt);
    if (!habit) throw new RangeError(`Unknown habit: ${id}`);
    return habit;
  };

  return {
    async listHabits() {
      return state.habits.filter((h) => !h.deletedAt).map((h) => ({ ...h }));
    },
    async addHabit(input) {
      const at = now();
      const habit: HabitRecord = { ...input, id: uuidv7(at.getTime()), createdAt: at.toISOString(), updatedAt: at.toISOString(), deletedAt: null };
      state.habits.push(habit);
      save();
      return { ...habit };
    },
    async updateHabit(id, patch) {
      const habit = liveHabit(id);
      Object.assign(habit, patch, { updatedAt: now().toISOString() });
      save();
      return { ...habit };
    },
    async removeHabit(id) {
      const habit = liveHabit(id);
      habit.deletedAt = habit.updatedAt = now().toISOString();
      save();
    },
    async listLogs(habitId) {
      return state.logs.filter((l) => l.habitId === habitId && !l.deletedAt).map((l) => ({ ...l }));
    },
    async addLog(input) {
      liveHabit(input.habitId);
      const at = now();
      const log: LogRecord = { ...input, id: uuidv7(at.getTime()), createdAt: at.toISOString(), deletedAt: null };
      state.logs.push(log);
      save();
      return { ...log };
    },
    async removeLog(id) {
      const log = state.logs.find((l) => l.id === id && !l.deletedAt);
      if (!log) throw new RangeError(`Unknown log: ${id}`);
      log.deletedAt = now().toISOString();
      save();
    },
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'habit:v1';

// Returns usable storage, or null (private mode, blocked cookies, quota 0).
export function tryStorage(get: () => StorageLike): StorageLike | null {
  try {
    const storage = get();
    storage.setItem('habit:probe', '1');
    storage.removeItem('habit:probe');
    return storage;
  } catch {
    return null;
  }
}

export function createStorageRepo(storage: StorageLike, now?: () => Date): HabitRepo {
  let seed: RepoState | undefined;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed && Array.isArray(parsed.habits) && Array.isArray(parsed.logs)) seed = parsed;
  } catch {
    // ponytail: corrupt data starts empty and is overwritten on next save; add a backup key if that ever bites
  }
  return createMemoryRepo({
    seed,
    now,
    onChange: (state) => {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // quota or access error: keep running from memory
      }
    },
  });
}
