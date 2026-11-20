import { uuidv7 } from './ids.ts';
import type { LogicalDate } from './logical-date.ts';
import type { Schedule } from './streak.ts';

// Fixed palette so every color has light and dark variants in the web styles.
export const HUES = ['green', 'teal', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow'] as const;
export type Hue = (typeof HUES)[number];

export interface HabitRecord {
  id: string;
  name: string;
  kind: 'boolean' | 'quantitative';
  quit?: boolean; // quit habit: clean every day unless a relapse is logged
  target: number;
  unit?: string;
  schedule: Schedule;
  startDate: LogicalDate;
  templateId?: string;
  reminderTime?: string;
  reminderTimes?: string[];
  icon?: string; // one emoji
  color?: Hue; // unset = green
  step?: number; // amount one tap adds (quantitative); unset = about a tenth of target
  archivedAt?: string | null;
  order?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LogRecord {
  id: string;
  habitId: string;
  logicalDate: LogicalDate;
  kind: 'complete' | 'skip' | 'freeze' | 'relapse';
  value: number;
  note?: string;
  occurredAt: string;
  isRetroactive: boolean;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface TaskRecord {
  id: string;
  title: string;
  dueDate?: LogicalDate;
  doneAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface RewardRecord {
  id: string; // completion log id: retries and cross-device sync converge on one reward
  logId: string;
  xp: number;
  gold: number;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export type NewTask = Pick<TaskRecord, 'title' | 'dueDate'>;
export type TaskPatch = Partial<Pick<TaskRecord, 'title' | 'dueDate' | 'doneAt'>>;

export type NewHabit = Omit<HabitRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
export type NewLog = Omit<LogRecord, 'id' | 'createdAt' | 'deletedAt'>;
export type HabitPatch = Partial<
  Pick<
    HabitRecord,
    | 'name'
    | 'kind'
    | 'quit'
    | 'target'
    | 'unit'
    | 'schedule'
    | 'startDate'
    | 'reminderTime'
    | 'reminderTimes'
    | 'icon'
    | 'color'
    | 'step'
    | 'archivedAt'
    | 'order'
  >
>;

// Async so a SQLite-backed repo can replace the in-memory one without touching the UI.
export interface HabitRepo {
  listHabits(): Promise<HabitRecord[]>;
  addHabit(input: NewHabit): Promise<HabitRecord>;
  updateHabit(id: string, patch: HabitPatch): Promise<HabitRecord>;
  removeHabit(id: string): Promise<void>;
  listLogs(habitId: string): Promise<LogRecord[]>;
  addLog(input: NewLog): Promise<LogRecord>;
  removeLog(id: string): Promise<void>;
  listRewards(): Promise<RewardRecord[]>;
  addReward(input: Pick<RewardRecord, 'logId' | 'xp' | 'gold'>): Promise<RewardRecord>;
  addCompletionWithReward(log: NewLog, reward: Pick<RewardRecord, 'xp' | 'gold'>): Promise<{ log: LogRecord; reward: RewardRecord }>;
  listTasks(): Promise<TaskRecord[]>;
  addTask(input: NewTask): Promise<TaskRecord>;
  updateTask(id: string, patch: TaskPatch): Promise<TaskRecord>;
  removeTask(id: string): Promise<void>;
}

export interface RepoState {
  habits: HabitRecord[];
  logs: LogRecord[];
  tasks?: TaskRecord[]; // absent in state saved before tasks existed
  rewards?: RewardRecord[];
}

export type SyncEntity = 'habits' | 'habit_logs' | 'tasks' | 'rewards';
export interface SyncItem {
  entity: SyncEntity;
  record: HabitRecord | LogRecord | TaskRecord | RewardRecord;
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
  const record = item?.record as unknown as Record<string, unknown> | undefined;
  if (!record || typeof record.id !== 'string' || !record.id || typeof record.createdAt !== 'string') return false;
  if (item.entity === 'habits') return typeof record.name === 'string';
  if (item.entity === 'tasks') return typeof record.title === 'string';
  if (item.entity === 'habit_logs') return typeof record.habitId === 'string' && typeof record.logicalDate === 'string';
  if (item.entity === 'rewards') return typeof record.logId === 'string' && typeof record.xp === 'number' && typeof record.gold === 'number';
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
  const state: RepoState & { tasks: TaskRecord[]; rewards: RewardRecord[] } = { tasks: [], rewards: [], ...(options.seed ? structuredClone(options.seed) : { habits: [], logs: [] }) };
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

  const liveTask = (id: string): TaskRecord => {
    const task = state.tasks.find((t) => t.id === id && !t.deletedAt);
    if (!task) throw new RangeError(`Unknown task: ${id}`);
    return task;
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
      const deletedAt = now().toISOString();
      log.deletedAt = deletedAt;
      const reward = state.rewards.find((r) => r.id === id && !r.deletedAt);
      if (reward) reward.deletedAt = reward.updatedAt = deletedAt;
      save();
    },
    async listRewards() {
      return state.rewards.filter((r) => !r.deletedAt).map((r) => ({ ...r }));
    },
    async addReward(input) {
      const existing = state.rewards.find((r) => r.id === input.logId && !r.deletedAt);
      if (existing) return { ...existing };
      const at = now().toISOString();
      const reward: RewardRecord = { ...input, id: input.logId, createdAt: at, updatedAt: at, deletedAt: null };
      state.rewards.push(reward);
      save();
      return { ...reward };
    },
    async addCompletionWithReward(input, payout) {
      liveHabit(input.habitId);
      const at = now().toISOString();
      const log: LogRecord = { ...input, id: uuidv7(now().getTime()), createdAt: at, deletedAt: null };
      const reward: RewardRecord = { id: log.id, logId: log.id, ...payout, createdAt: at, updatedAt: at, deletedAt: null };
      state.logs.push(log);
      state.rewards.push(reward);
      save();
      return { log: { ...log }, reward: { ...reward } };
    },
    async listTasks() {
      return state.tasks.filter((t) => !t.deletedAt).map((t) => ({ ...t }));
    },
    async addTask(input) {
      const at = now();
      const task: TaskRecord = { title: input.title, dueDate: input.dueDate, doneAt: null, id: uuidv7(at.getTime()), createdAt: at.toISOString(), updatedAt: at.toISOString(), deletedAt: null };
      state.tasks.push(task);
      save();
      return { ...task };
    },
    async updateTask(id, patch) {
      const task = liveTask(id);
      Object.assign(task, patch, { updatedAt: now().toISOString() });
      save();
      return { ...task };
    },
    async removeTask(id) {
      const task = liveTask(id);
      task.deletedAt = task.updatedAt = now().toISOString();
      save();
    },
    snapshot() {
      return [
        ...state.habits.map((record) => ({ entity: 'habits' as const, record: structuredClone(record) })),
        ...state.logs.map((record) => ({ entity: 'habit_logs' as const, record: structuredClone(record) })),
        ...state.tasks.map((record) => ({ entity: 'tasks' as const, record: structuredClone(record) })),
        ...state.rewards.map((record) => ({ entity: 'rewards' as const, record: structuredClone(record) })),
      ];
    },
    merge(items) {
      let applied = 0;
      for (const item of items) {
        if (!isValidItem(item)) continue;
        const list = (item.entity === 'habits' ? state.habits : item.entity === 'tasks' ? state.tasks : item.entity === 'rewards' ? state.rewards : state.logs) as SyncItem['record'][];
        const index = list.findIndex((r) => r.id === item.record.id);
        if (index === -1) {
          list.push(structuredClone(item.record));
          applied++;
        } else if (wins(item.record, list[index])) {
          list[index] = structuredClone(item.record);
          applied++;
        }
      }
      for (const log of state.logs) {
        if (!log.deletedAt) continue;
        const reward = state.rewards.find((r) => r.id === log.id && !r.deletedAt);
        if (reward) {
          reward.deletedAt = log.deletedAt;
          reward.updatedAt = log.deletedAt;
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

export const STORAGE_KEY = 'habit:v1';

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
