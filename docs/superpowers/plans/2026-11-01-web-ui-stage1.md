# Web UI Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working offline web app: pick habits from the catalog, check in daily (with retroactive check-ins), see streaks and a 26-week heatmap.

**Architecture:** All logic lives in `packages/core` (pure TS, tested with `node:test`): ids, heatmap, `HabitRepo` with memory and storage implementations, summary and check-in helpers. `apps/web` is a thin Vite + React shell that only renders state and calls those helpers. Storage is `localStorage` behind `HabitRepo` (async), so a later SQLite repo changes one file.

**Tech Stack:** TypeScript, Node 22 (`--experimental-strip-types`), pnpm 9 workspaces, Vite, React 18+.

Spec: `docs/superpowers/specs/2026-11-01-web-ui-stage1-design.md`

## Global Constraints

- Core has no I/O and no framework imports. Core tests run with `node --test --experimental-strip-types`; no test framework.
- Relative imports inside TypeScript files use the `.ts` extension (required by Node type stripping and `allowImportingTsExtensions`).
- Records mirror `habits` / `habit_logs` in `packages/db/schema.sql`, camelCase. Deletes are tombstones (`deletedAt`), never removal.
- Ids are UUIDv7 generated inline; no dependency.
- Default rollover 04:00 (240 minutes). Invalid timezone or rollover falls back to `UTC` / `0` with a banner.
- Retroactive window and start-date range: 30 days back from today (`RETRO_DAYS`).
- Heatmap: 26 weeks, Monday-aligned columns, 5 levels (0..4).
- Catalog is `HABIT_TEMPLATES` (37 items, 8 categories). No i18n in this stage.
- No component test framework. UI is verified in a real browser (Task 8).
- Run all commands from `/Users/up-mac/wokrspace/mind/habit` unless a step says otherwise.

## File Structure

Create in `packages/core/src/`:
- `ids.ts`: `uuidv7`.
- `heatmap.ts`: `heatmapLevels`, `HeatCell`.
- `repo.ts`: record types, `HabitRepo`, `createMemoryRepo`, `createStorageRepo`, `tryStorage`.
- `summary.ts`: `summarize`, `HabitSummary`.
- `checkin.ts`: `RETRO_DAYS`, `stepFor`, `canLog`, `checkIn`, `undoCheckIn`, `clearDay`.

Modify in `packages/core/src/`: `logical-date.ts` (add `safeBoundary`), `streak.ts` (export `isDue`).

Create in `packages/core/test/`: `ids.test.ts`, `heatmap.test.ts`, `boundary.test.ts`, `repo.test.ts`, `checkin.test.ts`.

Create in `apps/web/`: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/vite-env.d.ts`, `src/repo-local.ts`, `src/settings.ts`, `src/components/HabitRow.tsx`, `src/components/Heatmap.tsx`, `src/screens/Today.tsx`, `src/screens/AddHabit.tsx`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`.

Create at root: `.gitignore`, `.claude/launch.json`.

---

### Task 1: UUIDv7 ids and heatmap levels (core)

**Files:**
- Create: `packages/core/src/ids.ts`, `packages/core/src/heatmap.ts`
- Create: `packages/core/test/ids.test.ts`, `packages/core/test/heatmap.test.ts`
- Modify: `packages/core/package.json`

**Interfaces:**
- Produces: `uuidv7(nowMs?: number): string`; `HeatCell { date: LogicalDate; level: 0|1|2|3|4 }`; `heatmapLevels(rule: HabitRule, logs: LogRow[], from: LogicalDate, to: LogicalDate): HeatCell[]`.

- [ ] **Step 1: Initialise git and ignore file**

```bash
git init -b main
printf 'node_modules\ndist\n.turbo\n*.sqlite\n.env*\n' > .gitignore
```

- [ ] **Step 2: Update `packages/core/package.json`** (wildcard exports, run all tests)

Replace the file with:

```json
{
  "name": "@habit/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./*": "./src/*.ts"
  },
  "scripts": {
    "test": "node --test --experimental-strip-types test/*.test.ts"
  }
}
```

- [ ] **Step 3: Write failing tests**

`packages/core/test/ids.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv7 } from '../src/ids.ts';

test('uuidv7 has v7 and variant bits', () => {
  assert.match(uuidv7(), /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('uuidv7 sorts by timestamp', () => {
  assert.ok(uuidv7(1_000) < uuidv7(2_000));
  assert.ok(uuidv7(1_700_000_000_000) < uuidv7(1_700_000_000_001));
});

test('uuidv7 is unique within one millisecond', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(5)));
  assert.equal(ids.size, 1000);
});
```

`packages/core/test/heatmap.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatmapLevels } from '../src/heatmap.ts';
import type { HabitRule, LogRow } from '../src/streak.ts';

const rule = (target: number): HabitRule => ({ startDate: '2026-10-01', target, schedule: { type: 'daily' } });
const done = (logicalDate: string, value = 1): LogRow => ({ logicalDate, kind: 'complete', value });

test('boolean: done day is level 4, empty day level 0', () => {
  const cells = heatmapLevels(rule(1), [done('2026-10-02')], '2026-10-01', '2026-10-03');
  assert.deepEqual(cells, [
    { date: '2026-10-01', level: 0 },
    { date: '2026-10-02', level: 4 },
    { date: '2026-10-03', level: 0 },
  ]);
});

test('quantitative: ratio buckets, capped at 4', () => {
  const logs = [done('2026-10-01', 500), done('2026-10-02', 1000), done('2026-10-03', 1500), done('2026-10-04', 2000), done('2026-10-05', 3000)];
  const levels = heatmapLevels(rule(2000), logs, '2026-10-01', '2026-10-05').map((c) => c.level);
  assert.deepEqual(levels, [1, 2, 3, 4, 4]);
});

test('multiple logs on one day are summed', () => {
  const levels = heatmapLevels(rule(2000), [done('2026-10-01', 1000), done('2026-10-01', 1000)], '2026-10-01', '2026-10-01');
  assert.deepEqual(levels.map((c) => c.level), [4]);
});

test('skip, freeze and deleted logs give level 0', () => {
  const logs: LogRow[] = [
    { logicalDate: '2026-10-01', kind: 'skip', value: 0 },
    { logicalDate: '2026-10-02', kind: 'freeze', value: 0 },
    { ...done('2026-10-03'), deletedAt: '2026-10-04T00:00:00Z' },
  ];
  const levels = heatmapLevels(rule(1), logs, '2026-10-01', '2026-10-03').map((c) => c.level);
  assert.deepEqual(levels, [0, 0, 0]);
});

test('empty range returns no cells', () => {
  assert.deepEqual(heatmapLevels(rule(1), [], '2026-10-03', '2026-10-01'), []);
});
```

- [ ] **Step 4: Run tests, verify failure**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (pass|fail)|Cannot find|ERR_MODULE"`
Expected: failures mentioning missing `../src/ids.ts` / `../src/heatmap.ts`.

- [ ] **Step 5: Implement**

`packages/core/src/ids.ts`:

```ts
// UUIDv7: 48-bit unix-ms timestamp prefix, so ids sort by creation time. Random within the same ms.
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let ms = nowMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

`packages/core/src/heatmap.ts`:

```ts
import { addDays, type LogicalDate } from './logical-date.ts';
import type { HabitRule, LogRow } from './streak.ts';

export interface HeatCell {
  date: LogicalDate;
  level: 0 | 1 | 2 | 3 | 4;
}

// One cell per logical day in [from, to]. Level = ceil(min(done/target, 1) * 4).
// skip / freeze / deleted logs contribute nothing.
export function heatmapLevels(rule: HabitRule, logs: LogRow[], from: LogicalDate, to: LogicalDate): HeatCell[] {
  const totals = new Map<LogicalDate, number>();
  for (const log of logs) {
    if (log.deletedAt || log.kind !== 'complete') continue;
    totals.set(log.logicalDate, (totals.get(log.logicalDate) ?? 0) + log.value);
  }
  const cells: HeatCell[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const ratio = Math.min((totals.get(date) ?? 0) / rule.target, 1);
    cells.push({ date, level: Math.ceil(ratio * 4) as HeatCell['level'] });
  }
  return cells;
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, `# pass 19` (11 existing + 3 ids + 5 heatmap).

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml docs packages
git commit -m "feat(core): add uuidv7 and heatmap levels"
```

---

### Task 2: Safe day boundary and `isDue` (core)

**Files:**
- Modify: `packages/core/src/logical-date.ts` (append), `packages/core/src/streak.ts`
- Create: `packages/core/test/boundary.test.ts`

**Interfaces:**
- Produces: `safeBoundary(timeZone: string, rolloverMinutes: number): { boundary: DayBoundary; warning?: string }`; `isDue(schedule: Schedule, date: LogicalDate): boolean` (daily true, weekdays by ISO weekday, times_per_week true).

- [ ] **Step 1: Write failing test** `packages/core/test/boundary.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeBoundary } from '../src/logical-date.ts';
import { isDue } from '../src/streak.ts';

test('safeBoundary keeps valid input', () => {
  assert.deepEqual(safeBoundary('Asia/Bangkok', 240), { boundary: { timeZone: 'Asia/Bangkok', rolloverMinutes: 240 } });
});

test('safeBoundary falls back on bad timezone or rollover', () => {
  for (const [tz, minutes] of [['Mars/Olympus', 240], ['UTC', 1440], ['UTC', -1], ['UTC', 1.5]] as const) {
    const result = safeBoundary(tz, minutes);
    assert.deepEqual(result.boundary, { timeZone: 'UTC', rolloverMinutes: 0 });
    assert.ok(result.warning);
  }
});

test('isDue', () => {
  assert.equal(isDue({ type: 'daily' }, '2026-10-30'), true);
  assert.equal(isDue({ type: 'times_per_week', count: 3 }, '2026-10-30'), true);
  const mwf = { type: 'weekdays', days: [1, 3, 5] } as const;
  assert.equal(isDue(mwf, '2026-10-30'), true); // Friday
  assert.equal(isDue(mwf, '2026-10-31'), false); // Saturday
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (pass|fail)|not ok"`
Expected: failure (`safeBoundary` / `isDue` not exported).

- [ ] **Step 3: Implement**

Append to `packages/core/src/logical-date.ts`:

```ts

// For untrusted settings: returns the input if usable, else UTC with midnight rollover and a warning.
export function safeBoundary(timeZone: string, rolloverMinutes: number): { boundary: DayBoundary; warning?: string } {
  try {
    toLogicalDate(0, { timeZone, rolloverMinutes });
    return { boundary: { timeZone, rolloverMinutes } };
  } catch {
    return {
      boundary: { timeZone: 'UTC', rolloverMinutes: 0 },
      warning: 'Invalid timezone or rollover setting; using UTC with midnight rollover.',
    };
  }
}
```

In `packages/core/src/streak.ts`, add above `export function evaluateStreak`:

```ts
// times_per_week is not tied to specific days, so every day counts as a day you can do it.
export function isDue(schedule: Schedule, date: LogicalDate): boolean {
  return schedule.type !== 'weekdays' || schedule.days.includes(isoWeekday(date));
}

```

Replace the daily/weekdays loop body in `evaluateStreak`:

```ts
    for (let day = rule.startDate; day <= today; day = addDays(day, 1)) {
      const due = schedule.type === 'daily' || schedule.days.includes(isoWeekday(day));
      if (due) states.push(dayState(day));
    }
```

with:

```ts
    for (let day = rule.startDate; day <= today; day = addDays(day, 1)) {
      if (isDue(schedule, day)) states.push(dayState(day));
    }
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, `# pass 22`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add safeBoundary and isDue"
```

---

### Task 3: HabitRepo with memory and storage implementations (core)

**Files:**
- Create: `packages/core/src/repo.ts`, `packages/core/test/repo.test.ts`

**Interfaces:**
- Consumes: `uuidv7`, `Schedule`, `LogicalDate`.
- Produces (exact):
  - `HabitRecord { id; name; kind: 'boolean'|'quantitative'; target: number; unit?: string; schedule: Schedule; startDate: LogicalDate; templateId?: string; reminderTime?: string; createdAt: string; updatedAt: string; deletedAt?: string|null }`
  - `LogRecord { id; habitId; logicalDate; kind: 'complete'|'skip'|'freeze'; value: number; occurredAt: string; isRetroactive: boolean; createdAt: string; deletedAt?: string|null }`
  - `NewHabit = Omit<HabitRecord,'id'|'createdAt'|'updatedAt'|'deletedAt'>`, `NewLog = Omit<LogRecord,'id'|'createdAt'|'deletedAt'>`, `HabitPatch = Partial<Pick<HabitRecord,'name'|'target'|'startDate'|'reminderTime'>>`
  - `HabitRepo` with `listHabits()`, `addHabit(input)`, `updateHabit(id, patch)`, `removeHabit(id)`, `listLogs(habitId)`, `addLog(input)`, `removeLog(id)`, all returning Promises. `listHabits` / `listLogs` return only live (not deleted) rows, logs in insertion order.
  - `createMemoryRepo(options?: { seed?: RepoState; onChange?: (s: RepoState) => void; now?: () => Date }): HabitRepo`
  - `createStorageRepo(storage: StorageLike, now?: () => Date): HabitRepo`, `tryStorage(get: () => StorageLike): StorageLike | null`, `StorageLike { getItem; setItem; removeItem }`

- [ ] **Step 1: Write failing tests** `packages/core/test/repo.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, createStorageRepo, tryStorage, type NewHabit, type StorageLike } from '../src/repo.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };
const logInput = (habitId: string, logicalDate = '2026-10-30', value = 200) =>
  ({ habitId, logicalDate, kind: 'complete' as const, value, occurredAt: NOW.toISOString(), isRetroactive: false });

function stubStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value; },
    removeItem: (key) => { delete data[key]; },
  };
}

test('habits: add, list, update, remove (tombstone)', async () => {
  const repo = createMemoryRepo({ now: () => NOW });
  const habit = await repo.addHabit(water);
  assert.match(habit.id, /^[0-9a-f-]{36}$/);
  assert.equal(habit.createdAt, NOW.toISOString());
  assert.deepEqual((await repo.listHabits()).map((h) => h.name), ['Drink water']);

  const updated = await repo.updateHabit(habit.id, { name: 'Water', target: 2500 });
  assert.equal(updated.name, 'Water');
  assert.equal(updated.target, 2500);

  await repo.removeHabit(habit.id);
  assert.deepEqual(await repo.listHabits(), []);
  await assert.rejects(() => repo.updateHabit(habit.id, { name: 'x' }), RangeError);
});

test('logs: add, list in insertion order, remove hides but keeps tombstone', async () => {
  const states: unknown[] = [];
  const repo = createMemoryRepo({ now: () => NOW, onChange: (s) => states.push(structuredClone(s)) });
  const habit = await repo.addHabit(water);
  const a = await repo.addLog(logInput(habit.id, '2026-10-30', 200));
  const b = await repo.addLog(logInput(habit.id, '2026-10-30', 300));
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.value), [200, 300]);

  await repo.removeLog(a.id);
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.id), [b.id]);
  const last = states.at(-1) as { logs: { id: string; deletedAt: string | null }[] };
  assert.equal(last.logs.find((l) => l.id === a.id)?.deletedAt, NOW.toISOString());

  await assert.rejects(() => repo.removeLog(a.id), RangeError);
  await assert.rejects(() => repo.addLog(logInput('missing')), RangeError);
});

test('storage repo persists across instances', async () => {
  const storage = stubStorage();
  const first = createStorageRepo(storage, () => NOW);
  const habit = await first.addHabit(water);
  await first.addLog(logInput(habit.id));

  const second = createStorageRepo(storage, () => NOW);
  assert.deepEqual((await second.listHabits()).map((h) => h.id), [habit.id]);
  assert.equal((await second.listLogs(habit.id)).length, 1);
});

test('storage repo starts empty on corrupt or wrong-shape data', async () => {
  for (const bad of ['{not json', '"hello"', '{"habits":1,"logs":[]}']) {
    const repo = createStorageRepo(stubStorage({ 'habit:v1': bad }), () => NOW);
    assert.deepEqual(await repo.listHabits(), []);
  }
});

test('storage repo survives setItem failure (quota)', async () => {
  const storage = stubStorage();
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const repo = createStorageRepo(storage, () => NOW);
  await repo.addHabit(water);
  assert.equal((await repo.listHabits()).length, 1);
});

test('tryStorage returns storage when usable, null when access throws', () => {
  const storage = stubStorage();
  assert.equal(tryStorage(() => storage), storage);
  assert.deepEqual(storage.data, {});
  assert.equal(tryStorage(() => { throw new Error('SecurityError'); }), null);
  const readOnly = stubStorage();
  readOnly.setItem = () => { throw new Error('denied'); };
  assert.equal(tryStorage(() => readOnly), null);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (pass|fail)|Cannot find"`
Expected: failure, `../src/repo.ts` not found.

- [ ] **Step 3: Implement** `packages/core/src/repo.ts`

```ts
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
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, `# pass 28`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add HabitRepo with memory and storage implementations"
```

---

### Task 4: Summary and check-in helpers (core)

**Files:**
- Create: `packages/core/src/summary.ts`, `packages/core/src/checkin.ts`, `packages/core/test/checkin.test.ts`

**Interfaces:**
- Consumes: `HabitRepo`, `HabitRecord`, `LogRecord` (Task 3); `evaluateStreak`, `isDue`, `StreakResult` (Task 2); `daysBetween`, `LogicalDate`.
- Produces:
  - `HabitSummary { due: boolean; value: number; done: boolean; streak: StreakResult }`; `summarize(habit, logs, date, today): HabitSummary` (value and done are for `date`; streak is as of `today`).
  - `RETRO_DAYS = 30`; `stepFor(habit: Pick<HabitRecord,'kind'|'target'>): number`; `canLog(habit, date, today): boolean`; `checkIn(repo, habit, date, today, now?: Date): Promise<void>`; `undoCheckIn(repo, habit, date): Promise<void>`; `clearDay(repo, habit, date): Promise<void>`.

- [ ] **Step 1: Write failing tests** `packages/core/test/checkin.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo, type NewHabit } from '../src/repo.ts';
import { canLog, checkIn, clearDay, stepFor, undoCheckIn } from '../src/checkin.ts';
import { summarize } from '../src/summary.ts';

const NOW = new Date('2026-10-30T10:00:00Z');
const TODAY = '2026-10-30';
const water: NewHabit = { name: 'Drink water', kind: 'quantitative', target: 2000, unit: 'ml', schedule: { type: 'daily' }, startDate: '2026-10-29' };
const meditate: NewHabit = { name: 'Meditate', kind: 'boolean', target: 1, schedule: { type: 'daily' }, startDate: '2026-10-29' };

async function setup(input: NewHabit) {
  const repo = createMemoryRepo({ now: () => NOW });
  return { repo, habit: await repo.addHabit(input) };
}

test('stepFor: boolean 1, quantitative about a tenth of target, min 1', () => {
  assert.equal(stepFor({ kind: 'boolean', target: 1 }), 1);
  assert.equal(stepFor({ kind: 'quantitative', target: 2000 }), 200);
  assert.equal(stepFor({ kind: 'quantitative', target: 7 }), 1);
  assert.equal(stepFor({ kind: 'quantitative', target: 5 }), 1);
});

test('canLog: not before start, not in the future, not more than 30 days back', () => {
  const habit = { startDate: '2026-09-01' };
  assert.equal(canLog(habit, '2026-10-30', TODAY), true);
  assert.equal(canLog(habit, '2026-09-30', TODAY), true); // 30 days back
  assert.equal(canLog(habit, '2026-09-29', TODAY), false); // 31 days back
  assert.equal(canLog(habit, '2026-10-31', TODAY), false);
  assert.equal(canLog({ startDate: '2026-10-29' }, '2026-10-28', TODAY), false);
});

test('quantitative: ten steps reach target, undo removes one step', async () => {
  const { repo, habit } = await setup(water);
  for (let i = 0; i < 10; i++) await checkIn(repo, habit, TODAY, TODAY, NOW);
  let summary = summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY);
  assert.deepEqual({ value: summary.value, done: summary.done, current: summary.streak.current }, { value: 2000, done: true, current: 1 });

  await undoCheckIn(repo, habit, TODAY);
  summary = summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY);
  assert.deepEqual({ value: summary.value, done: summary.done }, { value: 1800, done: false });
});

test('retroactive check-in is flagged and updates the streak', async () => {
  const { repo, habit } = await setup(meditate);
  await checkIn(repo, habit, '2026-10-29', TODAY, NOW);
  const logs = await repo.listLogs(habit.id);
  assert.equal(logs[0].isRetroactive, true);
  assert.equal(summarize(habit, logs, TODAY, TODAY).streak.current, 1); // yesterday done, today still open

  await checkIn(repo, habit, TODAY, TODAY, NOW);
  assert.equal(summarize(habit, await repo.listLogs(habit.id), TODAY, TODAY).streak.current, 2);
});

test('clearDay removes every completion on that date only', async () => {
  const { repo, habit } = await setup(meditate);
  await checkIn(repo, habit, '2026-10-29', TODAY, NOW);
  await checkIn(repo, habit, TODAY, TODAY, NOW);
  await checkIn(repo, habit, TODAY, TODAY, NOW);
  await clearDay(repo, habit, TODAY);
  assert.deepEqual((await repo.listLogs(habit.id)).map((l) => l.logicalDate), ['2026-10-29']);
});

test('checkIn rejects dates outside the allowed range', async () => {
  const { repo, habit } = await setup(meditate);
  await assert.rejects(() => checkIn(repo, habit, '2026-10-28', TODAY, NOW), RangeError);
  await assert.rejects(() => checkIn(repo, habit, '2026-10-31', TODAY, NOW), RangeError);
});

test('summarize: due follows the schedule', async () => {
  const { repo, habit } = await setup({ ...meditate, schedule: { type: 'weekdays', days: [1, 3, 5] } });
  const logs = await repo.listLogs(habit.id);
  assert.equal(summarize(habit, logs, '2026-10-30', TODAY).due, true); // Friday
  assert.equal(summarize(habit, logs, '2026-10-29', TODAY).due, false); // Thursday
});
```

- [ ] **Step 2: Run, verify failure**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (pass|fail)|Cannot find"`
Expected: failure, `../src/checkin.ts` not found.

- [ ] **Step 3: Implement**

`packages/core/src/summary.ts`:

```ts
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
```

`packages/core/src/checkin.ts`:

```ts
import { daysBetween, type LogicalDate } from './logical-date.ts';
import type { HabitRecord, HabitRepo } from './repo.ts';

export const RETRO_DAYS = 30;

// One tap adds this much. Boolean habits: 1. Quantitative: about a tenth of the target.
export function stepFor(habit: Pick<HabitRecord, 'kind' | 'target'>): number {
  return habit.kind === 'boolean' ? 1 : Math.max(1, Math.round(habit.target / 10));
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
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test --prefix packages/core 2>&1 | grep -E "^# (tests|pass|fail)"`
Expected: `# fail 0`, `# pass 35`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add summary and check-in helpers"
```

---

### Task 5: Web app scaffold (Vite + React), repo wiring, settings

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/vite-env.d.ts`, `apps/web/src/repo-local.ts`, `apps/web/src/settings.ts`, `.claude/launch.json`

**Interfaces:**
- Consumes: `createStorageRepo`, `createMemoryRepo`, `tryStorage`, `StorageLike` (Task 3); `safeBoundary` (Task 2).
- Produces: `repo: HabitRepo`, `storage: StorageLike | null`, `persistent: boolean` (from `repo-local.ts`); `loadRolloverMinutes(storage): number`, `saveRolloverMinutes(storage, minutes): void`, `browserTimeZone(): string` (from `settings.ts`).

- [ ] **Step 1: Ensure pnpm**

Run: `pnpm -v`
If not found: `corepack enable pnpm` then re-run. If that fails (permissions), use `npx -y pnpm@9.15.0` in place of `pnpm` in every command below.
Expected: prints `9.x`.

- [ ] **Step 2: Write scaffold files**

`apps/web/package.json`:

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@habit/core": "workspace:*"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Habits</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`apps/web/src/repo-local.ts`:

```ts
import { createMemoryRepo, createStorageRepo, tryStorage } from '@habit/core/repo';

export const storage = tryStorage(() => window.localStorage);
export const persistent = storage !== null;
export const repo = storage ? createStorageRepo(storage) : createMemoryRepo();
```

`apps/web/src/settings.ts`:

```ts
import type { StorageLike } from '@habit/core/repo';

const KEY = 'habit:rollover-minutes';
export const DEFAULT_ROLLOVER_MINUTES = 240; // 04:00

export function loadRolloverMinutes(storage: StorageLike | null): number {
  try {
    const raw = storage?.getItem(KEY);
    if (raw != null && Number.isInteger(Number(raw))) return Number(raw);
  } catch {
    // fall through to default
  }
  return DEFAULT_ROLLOVER_MINUTES;
}

export function saveRolloverMinutes(storage: StorageLike | null, minutes: number): void {
  try {
    storage?.setItem(KEY, String(minutes));
  } catch {
    // setting lasts for this session only
  }
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
```

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["-F", "web", "dev", "--port", "5173"], "port": 5173 }
  ]
}
```

- [ ] **Step 3: Install dependencies**

```bash
pnpm install
pnpm -F web add react react-dom
pnpm -F web add -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```
Expected: installs without errors; `apps/web/package.json` now lists versions.

- [ ] **Step 4: Typecheck**

Run: `pnpm -F web typecheck`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add apps .claude pnpm-lock.yaml package.json
git commit -m "feat(web): scaffold Vite React app with repo wiring and settings"
```

---

### Task 6: Today screen, HabitRow, Heatmap, styles

**Files:**
- Create: `apps/web/src/components/HabitRow.tsx`, `apps/web/src/components/Heatmap.tsx`, `apps/web/src/screens/Today.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `repo` (Task 5); `summarize`, `HabitSummary` (Task 4); `canLog`, `checkIn`, `undoCheckIn`, `clearDay`, `RETRO_DAYS` (Task 4); `heatmapLevels`, `HeatCell` (Task 1); `addDays`, `startOfIsoWeek`, `LogicalDate`.
- Produces: `Today({ today: LogicalDate; onAdd(): void })`; `HabitRow`; `Heatmap({ cells: HeatCell[] })`; CSS classes used by Task 7 and 8 (`.banner`, `.card`, `.primary`, `.field`, `.error`, `.category`, `.template`).

- [ ] **Step 1: Write `apps/web/src/components/Heatmap.tsx`**

```tsx
import type { HeatCell } from '@habit/core/heatmap';

export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="heatmap" role="img" aria-label="Completion heatmap, last 26 weeks">
      {cells.map((cell) => (
        <span key={cell.date} className={`cell l${cell.level}`} title={cell.date} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/components/HabitRow.tsx`**

```tsx
import type { HabitRecord } from '@habit/core/repo';
import type { HabitSummary } from '@habit/core/summary';

interface Props {
  habit: HabitRecord;
  summary: HabitSummary;
  canEdit: boolean;
  selected: boolean;
  onSelect(): void;
  onToggle(): void;
  onPlus(): void;
  onMinus(): void;
}

export function HabitRow({ habit, summary, canEdit, selected, onSelect, onToggle, onPlus, onMinus }: Props) {
  const unit = habit.schedule.type === 'times_per_week' ? 'wk' : 'd';
  return (
    <li className={`row${selected ? ' selected' : ''}`}>
      <button className="name" onClick={onSelect}>
        <span>{habit.name}</span>
        <small>
          {summary.streak.current} {unit} streak
        </small>
      </button>
      {habit.kind === 'boolean' ? (
        <button className="check" aria-pressed={summary.done} disabled={!canEdit} onClick={onToggle}>
          {summary.done ? 'Done' : 'Mark done'}
        </button>
      ) : (
        <div className="stepper">
          <button aria-label={`Remove one step from ${habit.name}`} disabled={!canEdit || summary.value === 0} onClick={onMinus}>
            −
          </button>
          <span className={summary.done ? 'done' : ''}>
            {summary.value} / {habit.target} {habit.unit}
          </span>
          <button aria-label={`Add one step to ${habit.name}`} disabled={!canEdit} onClick={onPlus}>
            +
          </button>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Write `apps/web/src/screens/Today.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { canLog, checkIn, clearDay, RETRO_DAYS, undoCheckIn } from '@habit/core/checkin';
import { heatmapLevels } from '@habit/core/heatmap';
import { addDays, startOfIsoWeek, type LogicalDate } from '@habit/core/logical-date';
import type { HabitRecord, LogRecord } from '@habit/core/repo';
import { summarize } from '@habit/core/summary';
import { HabitRow } from '../components/HabitRow.tsx';
import { Heatmap } from '../components/Heatmap.tsx';
import { repo } from '../repo-local.ts';

export function Today({ today, onAdd }: { today: LogicalDate; onAdd(): void }) {
  const [habits, setHabits] = useState<HabitRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, LogRecord[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = addDays(today, -offset);

  const reload = useCallback(async () => {
    const list = await repo.listHabits();
    const entries = await Promise.all(list.map(async (habit) => [habit.id, await repo.listLogs(habit.id)] as const));
    setHabits(list);
    setLogs(Object.fromEntries(entries));
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<void>) => {
    try {
      setError(null);
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const rows = useMemo(
    () => habits.map((habit) => ({ habit, summary: summarize(habit, logs[habit.id] ?? [], date, today) })),
    [habits, logs, date, today],
  );
  const dueRows = rows.filter((row) => row.summary.due);
  const otherRows = rows.filter((row) => !row.summary.due);
  const selected = habits.find((habit) => habit.id === selectedId) ?? habits[0];
  const cells = selected
    ? heatmapLevels(
        { startDate: selected.startDate, target: selected.target, schedule: selected.schedule },
        logs[selected.id] ?? [],
        addDays(startOfIsoWeek(today), -25 * 7),
        today,
      )
    : [];

  const renderRow = ({ habit, summary }: (typeof rows)[number]) => (
    <HabitRow
      key={habit.id}
      habit={habit}
      summary={summary}
      canEdit={canLog(habit, date, today)}
      selected={habit.id === selected?.id}
      onSelect={() => setSelectedId(habit.id)}
      onToggle={() => run(() => (summary.done ? clearDay(repo, habit, date) : checkIn(repo, habit, date, today)))}
      onPlus={() => run(() => checkIn(repo, habit, date, today))}
      onMinus={() => run(() => undoCheckIn(repo, habit, date))}
    />
  );

  return (
    <>
      <div className="datebar">
        <button aria-label="Previous day" disabled={offset >= RETRO_DAYS} onClick={() => setOffset(offset + 1)}>
          ‹
        </button>
        <strong>{offset === 0 ? `Today · ${date}` : date}</strong>
        <button aria-label="Next day" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
          ›
        </button>
        <button className="primary" onClick={onAdd}>
          + Add habit
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loaded && habits.length === 0 ? (
        <div className="card empty">
          <p>No habits yet.</p>
          <button className="primary" onClick={onAdd}>
            Add your first habit
          </button>
        </div>
      ) : (
        <>
          <ul className="rows">{dueRows.map(renderRow)}</ul>
          {otherRows.length > 0 && (
            <details>
              <summary>Not today ({otherRows.length})</summary>
              <ul className="rows">{otherRows.map(renderRow)}</ul>
            </details>
          )}
        </>
      )}

      {selected && (
        <section className="card">
          <h2>{selected.name}</h2>
          <Heatmap cells={cells} />
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 4: Write `apps/web/src/styles.css`**

```css
:root {
  --bg: #f7f7f5; --surface: #fff; --text: #1c1c1a; --muted: #6b6b66; --border: #e2e2dc;
  --accent: #2f7d5b; --accent-text: #fff; --danger: #b3261e;
  --warn-bg: #fff3cd; --warn-text: #664d03;
  --l0: #ebedf0; --l1: #c6e6d3; --l2: #8fcfa9; --l3: #4fa97a; --l4: #2f7d5b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141413; --surface: #1e1e1c; --text: #ececea; --muted: #9a9a94; --border: #33332f;
    --accent: #4fa97a; --accent-text: #0b140f; --danger: #f2b8b5;
    --warn-bg: #3b3010; --warn-text: #ffe08a;
    --l0: #2a2a27; --l1: #1f4a35; --l2: #2c6e4d; --l3: #3c9164; --l4: #5cc08d;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.4rem; margin: 0; }
h2 { font-size: 1rem; margin: 0 0 12px; }
h3 { font-size: .8rem; margin: 20px 0 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
button { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; cursor: pointer; }
button:disabled { opacity: .45; cursor: not-allowed; }
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.topbar label { font-size: .85rem; color: var(--muted); display: flex; gap: 8px; align-items: center; }
select, input { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.banner { background: var(--warn-bg); color: var(--warn-text); padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; }
.error { color: var(--danger); }
.datebar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.datebar strong { flex: 1; text-align: center; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-top: 16px; }
.empty { text-align: center; }
.rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 8px 8px 12px; }
.row.selected { border-color: var(--accent); }
.row .name { display: grid; text-align: left; border: 0; background: none; padding: 4px 0; flex: 1; }
.row .name small { color: var(--muted); }
.check[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.stepper { display: flex; align-items: center; gap: 8px; }
.stepper .done { color: var(--accent); font-weight: 600; }
details { margin-top: 12px; }
details summary { cursor: pointer; color: var(--muted); margin-bottom: 8px; }
.heatmap { display: grid; grid-template-rows: repeat(7, 12px); grid-auto-flow: column; grid-auto-columns: 12px; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.cell { width: 12px; height: 12px; border-radius: 2px; }
.l0 { background: var(--l0); } .l1 { background: var(--l1); } .l2 { background: var(--l2); } .l3 { background: var(--l3); } .l4 { background: var(--l4); }
.template { display: flex; justify-content: space-between; width: 100%; text-align: left; margin-bottom: 6px; }
.template small { color: var(--muted); }
.field { display: grid; gap: 4px; margin-bottom: 12px; }
.field span { font-size: .85rem; color: var(--muted); }
.actions { display: flex; gap: 8px; }
```

- [ ] **Step 5: Typecheck**

Run: `pnpm -F web typecheck`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add apps
git commit -m "feat(web): add Today screen, habit row, heatmap, styles"
```

---

### Task 7: Add habit screen

**Files:**
- Create: `apps/web/src/screens/AddHabit.tsx`

**Interfaces:**
- Consumes: `templatesByCategory`, `HabitTemplate` (existing `templates.ts`); `RETRO_DAYS`; `addDays`, `assertLogicalDate`, `LogicalDate`; `Schedule`; `repo`.
- Produces: `AddHabit({ today: LogicalDate; onDone(): void; onCancel(): void })`.

- [ ] **Step 1: Write `apps/web/src/screens/AddHabit.tsx`**

```tsx
import { useState } from 'react';
import { RETRO_DAYS } from '@habit/core/checkin';
import { addDays, assertLogicalDate, type LogicalDate } from '@habit/core/logical-date';
import type { Schedule } from '@habit/core/streak';
import { templatesByCategory, type HabitTemplate } from '@habit/core/templates';
import { repo } from '../repo-local.ts';

interface Draft {
  name: string;
  kind: 'boolean' | 'quantitative';
  target: number;
  unit: string;
  schedule: Schedule;
  startDate: string;
  templateId?: string;
  reminderTime?: string;
  custom: boolean;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function describe(schedule: Schedule): string {
  if (schedule.type === 'daily') return 'Every day';
  if (schedule.type === 'weekdays') return schedule.days.map((d) => DAY_NAMES[d - 1]).join(', ');
  return `${schedule.count}× per week`;
}

function fromTemplate(t: HabitTemplate, today: LogicalDate): Draft {
  return { name: t.name, kind: t.kind, target: t.target, unit: t.unit ?? '', schedule: t.schedule, startDate: today, templateId: t.id, reminderTime: t.reminderTime, custom: false };
}

function blankCustom(today: LogicalDate): Draft {
  return { name: '', kind: 'boolean', target: 1, unit: '', schedule: { type: 'daily' }, startDate: today, custom: true };
}

export function AddHabit({ today, onDone, onCancel }: { today: LogicalDate; onDone(): void; onCancel(): void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(d: Draft) {
    const name = d.name.trim();
    if (!name) return setError('Name is required.');
    if (d.kind === 'quantitative' && !(d.target > 0)) return setError('Target must be greater than 0.');
    if (d.kind === 'quantitative' && !d.unit.trim()) return setError('Unit is required.');
    try {
      assertLogicalDate(d.startDate);
    } catch {
      return setError('Start date is invalid.');
    }
    if (d.startDate > today || d.startDate < addDays(today, -RETRO_DAYS)) {
      return setError(`Start date must be within the last ${RETRO_DAYS} days.`);
    }
    await repo.addHabit({
      name,
      kind: d.kind,
      target: d.kind === 'boolean' ? 1 : d.target,
      unit: d.kind === 'quantitative' ? d.unit.trim() : undefined,
      schedule: d.schedule,
      startDate: d.startDate,
      templateId: d.templateId,
      reminderTime: d.reminderTime,
    });
    onDone();
  }

  if (draft) {
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
    return (
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void save(draft);
        }}
      >
        <h2>{draft.custom ? 'Custom habit' : 'New habit'}</h2>
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </label>
        {draft.custom && (
          <label className="field">
            <span>Type</span>
            <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as Draft['kind'], target: e.target.value === 'boolean' ? 1 : 10 })}>
              <option value="boolean">Yes / no</option>
              <option value="quantitative">Amount</option>
            </select>
          </label>
        )}
        {draft.kind === 'quantitative' && (
          <>
            <label className="field">
              <span>Daily target</span>
              <input type="number" min="1" value={draft.target} onChange={(e) => set({ target: Number(e.target.value) })} />
            </label>
            {draft.custom && (
              <label className="field">
                <span>Unit</span>
                <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="ml, pages, min" />
              </label>
            )}
          </>
        )}
        <p>Schedule: {describe(draft.schedule)}</p>
        <label className="field">
          <span>Started on</span>
          <input type="date" value={draft.startDate} min={addDays(today, -RETRO_DAYS)} max={today} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" onClick={() => { setDraft(null); setError(null); }}>
            Back
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="datebar">
        <strong>Add a habit</strong>
        <button onClick={onCancel}>Cancel</button>
      </div>
      <button className="template" onClick={() => setDraft(blankCustom(today))}>
        <span>Custom habit</span>
        <small>Your own name and target</small>
      </button>
      {[...templatesByCategory()].map(([category, templates]) => (
        <section key={category}>
          <h3>{category}</h3>
          {templates.map((t) => (
            <button key={t.id} className="template" onClick={() => setDraft(fromTemplate(t, today))}>
              <span>{t.name}</span>
              <small>
                {t.kind === 'quantitative' ? `${t.target} ${t.unit}` : 'Yes / no'} · {describe(t.schedule)}
              </small>
            </button>
          ))}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F web typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add apps
git commit -m "feat(web): add habit catalog picker and form"
```

---

### Task 8: App shell, entry point, production build

**Files:**
- Create: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `Today`, `AddHabit` (Tasks 6, 7); `persistent`, `storage` (Task 5); `loadRolloverMinutes`, `saveRolloverMinutes`, `browserTimeZone` (Task 5); `safeBoundary`, `currentLogicalDate`.

- [ ] **Step 1: Write `apps/web/src/App.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { currentLogicalDate, safeBoundary } from '@habit/core/logical-date';
import { persistent, storage } from './repo-local.ts';
import { AddHabit } from './screens/AddHabit.tsx';
import { Today } from './screens/Today.tsx';
import { browserTimeZone, loadRolloverMinutes, saveRolloverMinutes } from './settings.ts';

export function App() {
  const [screen, setScreen] = useState<'today' | 'add'>('today');
  const [rolloverMinutes, setRolloverMinutes] = useState(() => loadRolloverMinutes(storage));
  const [, tick] = useState(0);

  // Re-evaluate the logical date every minute so the day flips while the app stays open.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { boundary, warning } = useMemo(() => safeBoundary(browserTimeZone(), rolloverMinutes), [rolloverMinutes]);
  const today = currentLogicalDate(boundary);

  return (
    <main>
      <div className="topbar">
        <h1>Habits</h1>
        <label>
          Day starts at
          <select
            value={String(rolloverMinutes / 60)}
            onChange={(e) => {
              const minutes = Number(e.target.value) * 60;
              setRolloverMinutes(minutes);
              saveRolloverMinutes(storage, minutes);
            }}
          >
            {Array.from({ length: 9 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>
      </div>
      {!persistent && <p className="banner">Storage is unavailable. Your data will not persist after you close this tab.</p>}
      {warning && <p className="banner">{warning}</p>}
      {screen === 'today' ? (
        <Today today={today} onAdd={() => setScreen('add')} />
      ) : (
        <AddHabit today={today} onDone={() => setScreen('today')} onCancel={() => setScreen('today')} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Build**

Run: `pnpm -F web build`
Expected: `tsc` passes, then Vite prints `✓ built in …` and writes `apps/web/dist/`.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: core reports `# fail 0`, `# pass 35`.

- [ ] **Step 5: Commit**

```bash
git add apps
git commit -m "feat(web): add app shell and entry point"
```

---

### Task 9: Browser verification against spec success criteria

**Files:** none (verification only; fix defects in the file that owns them).

- [ ] **Step 1: Start the dev server**

Use `preview_start` with name `web` (reads `.claude/launch.json`), or run `pnpm -F web dev --port 5173`.
Expected: server on `http://localhost:5173`.

- [ ] **Step 2: Walk the success criteria in the browser**

Open `http://localhost:5173` with a clean `localStorage` (DevTools → Application → clear site data) and check each:

1. Fresh load shows "No habits yet." and an "Add your first habit" button, no console errors.
2. Click it → catalog grouped into 8 categories. Pick **Drink water** → form shows target 2000 ml, schedule Every day, Started on = today. Save.
3. Back on Today: row "Drink water", `0 / 2000 ml`. Click `+` ten times → `2000 / 2000 ml` highlighted, `1 d streak`. Click `−` once → `1800 / 2000 ml`, not done.
4. Heatmap card for the selected habit shows today's cell shaded, 26 columns, rows aligned Monday to Sunday.
5. Reload the page → habit, value and streak are unchanged. Then set DevTools → Network → Offline and reload → app still loads and works.
6. Add **Custom habit** with name "Read", type Yes / no, **Started on** = yesterday. Press ‹ (previous day), click **Mark done** → shows Done. Press › to return to today: streak reads `1 d streak`. Mark today done → `2 d streak`.
7. Press ‹ until the 30th day back: the ‹ button disables. On a habit started today, ‹ day shows disabled controls (before start).
8. Change "Day starts at" to 00:00 and back to 04:00: header date stays consistent with the browser clock and rollover; no errors.
9. In DevTools console run `localStorage.setItem('habit:rollover-minutes','1440')` then reload → yellow banner "Invalid timezone or rollover setting…" and the app still renders.
10. Block storage check: open the page in a private window with site data blocked, or run `Storage.prototype.setItem = () => { throw new Error('x') }` before load; the "Storage is unavailable" banner appears and the app works until closed.

- [ ] **Step 3: Fix any defect found**

Make the fix in the owning file, add a core test first if the cause is in `packages/core`, re-run `pnpm test` and `pnpm -F web build`, and repeat the failed check.

- [ ] **Step 4: Stop the server and commit any fixes**

```bash
git add -A
git commit -m "fix(web): address issues found in browser verification"
```
(Skip the commit if nothing changed.)
