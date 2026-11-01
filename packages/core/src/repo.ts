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
  updatedAt?: string;
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

export type SyncEntity = 'habits' | 'habit_logs';
export interface SyncItem {
  entity: SyncEntity;
  record: HabitRecord | LogRecord;
}

// Last-write-wins version of a record. A tombstone later than the last update is the version.
export function versionOf(record: { createdAt: string; updatedAt?: string; deletedAt?: string | null }): string {
  const base = record.updatedAt ?? record.createdAt;
  return record.deletedAt && record.deletedAt > base ? record.deletedAt : base;
}

// What a sync engine needs from a local store. snapshot() includes tombstones.
export interface SyncAccess {
  snapshot(): SyncItem[];
  // Applies items that win last-write-wins. Returns how many changed local state.
  merge(items: SyncItem[]): number;
  subscribe(listener: () => void): () => void;
}

export type LocalRepo = HabitRepo & SyncAccess;

function isValidItem(item: SyncItem): boolean {
  const record = item?.record as Partial<HabitRecord & LogRecord> | undefined;
  if (!record || typeof record.id !== 'string' || !record.id || typeof record.createdAt !== 'string') return false;
  if (item.entity === 'habits') return typeof record.name === 'string';
  if (item.entity === 'habit_logs') return typeof record.habitId === 'string' && typeof record.logicalDate === 'string';
  return false;
}

// Newer version wins. On a tie a tombstone beats a live copy so deletes never resurrect.
function wins(incoming: SyncItem['record'], local: SyncItem['record']): boolean {
  const a = versionOf(incoming);
  const b = versionOf(local);
  return a > b || (a === b && !!incoming.deletedAt && !local.deletedAt);
}

export interface MemoryRepoOptions {
  seed?: RepoState;
  onChange?: (state: RepoState) => void;
  now?: () => Date;
}

export function createMemoryRepo(options: MemoryRepoOptions = {}): LocalRepo {
  const now = options.now ?? (() => new Date());
  const state: RepoState = options.seed ? structuredClone(options.seed) : { habits: [], logs: [] };
  const listeners = new Set<() => void>();
  const save = () => {
    options.onChange?.(state);
    for (const listener of listeners) listener();
  };

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
    snapshot() {
      return [
        ...state.habits.map((record) => ({ entity: 'habits' as const, record: structuredClone(record) })),
        ...state.logs.map((record) => ({ entity: 'habit_logs' as const, record: structuredClone(record) })),
      ];
    },
    merge(items) {
      let applied = 0;
      for (const item of items) {
        if (!isValidItem(item)) continue;
        const list = (item.entity === 'habits' ? state.habits : state.logs) as SyncItem['record'][];
        const index = list.findIndex((r) => r.id === item.record.id);
        if (index === -1) {
          list.push(structuredClone(item.record));
          applied++;
        } else if (wins(item.record, list[index])) {
          list[index] = structuredClone(item.record);
          applied++;
        }
      }
      if (applied > 0) save();
      return applied;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
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

export function createStorageRepo(storage: StorageLike, now?: () => Date): LocalRepo {
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
