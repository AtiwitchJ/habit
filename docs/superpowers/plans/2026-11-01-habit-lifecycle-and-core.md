# Habit Lifecycle Management & Core Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide complete habit management (Edit, Delete with tombstones, Archive, and Reorder), expose the core engine's existing `skip` and `freeze` excused-day mechanisms directly in the Web UI, and enable a dedicated Habit Detail & History modal.

**Architecture:** Extend `@habit/core` with `skipDay`, `freezeDay`, `removeExcusedDay`, and `computeHabitStats` covered by `node:test`. In `apps/web`, build `EditHabit.tsx` and `HabitDetailModal.tsx`, update `HabitRow.tsx` and `Today.tsx` with active/archived views, and connect state mutations to `HabitRepo` with LWW sync preservation.

**Tech Stack:** TypeScript (Node 22 `--experimental-strip-types`), React 19, Vite 8, Bun, CSS modules/tokens.

Spec: `docs/superpowers/specs/2026-11-01-habit-lifecycle-and-core-design.md`

## Global Constraints

- Core has ZERO I/O and zero framework dependencies. All core tests run via `node --test --experimental-strip-types packages/core/test/*.test.ts`.
- Deletions are ALWAYS tombstones (`deletedAt = new Date().toISOString()`), never physical row removal.
- All date calculations must flow through `toLogicalDate(instant, safeBoundary(tz, rolloverMinutes))`; never use raw `new Date().toISOString().slice(0, 10)` for habit logic.
- Preserves sync compatibility with PocketBase `records` collection (LWW by `versionOf(record)`).
- Web application must build cleanly via `bun run --cwd apps/web build` and pass `bun run --cwd apps/web typecheck`.

---

### Task 1: Domain Core Extensions — Skip, Freeze, Notes, and Habit Stats

**Files:**
- Modify: `packages/core/src/repo.ts`
- Modify: `packages/core/src/checkin.ts`
- Modify: `packages/core/src/summary.ts`
- Test: `packages/core/test/checkin.test.ts`
- Test: `packages/core/test/summary.test.ts`

**Interfaces:**
- `LogRecord`: add `note?: string`
- `HabitRecord`: add `archivedAt?: string`, `order?: number`
- `checkin.ts`:
  - `skipDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, note?: string): Promise<void>`
  - `freezeDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, note?: string): Promise<void>`
  - `removeExcusedDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void>`
- `summary.ts`:
  - `computeHabitStats(habit: HabitRecord, logs: LogRecord[], today: LogicalDate): HabitDetailStats`

- [ ] **Step 1: Write failing tests for skip, freeze, and excused log helpers**

Add tests to `packages/core/test/checkin.test.ts`:
```ts
test('skipDay adds a skip log and freezeDay adds a freeze log', async () => {
  const repo = createMemoryRepo();
  const habit = await repo.addHabit({
    name: 'Workout',
    kind: 'boolean',
    target: 1,
    schedule: { type: 'daily' },
    startDate: '2026-10-01',
  });
  await skipDay(repo, habit, '2026-10-05', '2026-10-05', 'Sick day');
  let logs = await repo.listLogs(habit.id);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].kind, 'skip');
  assert.equal(logs[0].note, 'Sick day');

  await freezeDay(repo, habit, '2026-10-06', '2026-10-06');
  logs = await repo.listLogs(habit.id);
  assert.equal(logs.length, 2);
  assert.equal(logs[1].kind, 'freeze');

  await removeExcusedDay(repo, habit, '2026-10-05');
  logs = await repo.listLogs(habit.id);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].kind, 'freeze');
});
```

- [ ] **Step 2: Write failing tests for computeHabitStats**

Add tests to `packages/core/test/summary.test.ts`:
```ts
test('computeHabitStats computes streak, total completions, and 30d completion rate', async () => {
  const habit: HabitRecord = {
    id: 'h1',
    name: 'Read',
    kind: 'boolean',
    target: 1,
    schedule: { type: 'daily' },
    startDate: '2026-10-01',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const logs: LogRecord[] = [
    { id: 'l1', habitId: 'h1', logicalDate: '2026-10-30', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
    { id: 'l2', habitId: 'h1', logicalDate: '2026-10-31', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
    { id: 'l3', habitId: 'h1', logicalDate: '2026-11-01', kind: 'complete', value: 1, occurredAt: '', isRetroactive: false, createdAt: '' },
  ];
  const stats = computeHabitStats(habit, logs, '2026-11-01');
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.longestStreak, 3);
  assert.equal(stats.totalCompletions, 3);
  assert.ok(stats.completionRate30d > 0);
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
node --test --experimental-strip-types packages/core/test/*.test.ts
```

- [ ] **Step 4: Implement domain logic**

Update `packages/core/src/repo.ts`, `packages/core/src/checkin.ts`, and `packages/core/src/summary.ts`.

- [ ] **Step 5: Run all core tests and verify pass**

```bash
node --test --experimental-strip-types packages/core/test/*.test.ts
```

- [ ] **Step 6: Commit changes**

```bash
git add packages/core
git commit -m "feat(core): add skipDay, freezeDay, check-in notes and computeHabitStats"
```

---

### Task 2: Edit Habit Screen (`EditHabit.tsx`)

**Files:**
- Create: `apps/web/src/screens/EditHabit.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `EditHabit({ habit, onDone, onCancel }: { habit: HabitRecord; onDone(): void; onCancel(): void })`

- [ ] **Step 1: Create `apps/web/src/screens/EditHabit.tsx`**

Allow editing:
- Name (string)
- Emoji icon (single emoji via Intl.Segmenter)
- Color hue (8 swatches)
- Target, unit, tap step (for quantitative)
- Schedule (daily, weekdays, times_per_week)
Save invokes `repo.updateHabit(habit.id, patch)`.

- [ ] **Step 2: Wire screen routing into `apps/web/src/App.tsx`**

Support `screen` state switching between `'today' | 'add' | 'edit'`, keeping `editingHabit` in state.

- [ ] **Step 3: Verify TypeScript and Web Build**

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

- [ ] **Step 4: Commit changes**

```bash
git add apps/web
git commit -m "feat(web): add EditHabit screen and routing"
```

---

### Task 3: Habit Detail Modal & Excused Day UI

**Files:**
- Create: `apps/web/src/components/HabitDetailModal.tsx`
- Modify: `apps/web/src/components/HabitRow.tsx`
- Modify: `apps/web/src/screens/Today.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `HabitDetailModal` props:
  - `habit: HabitRecord`
  - `logs: LogRecord[]`
  - `today: LogicalDate`
  - `selectedDate: LogicalDate`
  - `onClose(): void`
  - `onEdit(habit: HabitRecord): void`
  - `onToggle(): void`
  - `onSkip(note?: string): void`
  - `onFreeze(note?: string): void`
  - `onUnexcuse(): void`
  - `onArchive(): void`
  - `onDelete(): void`

- [ ] **Step 1: Create `HabitDetailModal.tsx`**

Displays:
- Header with habit emoji, name, color banner
- Streak stats badges: Current streak, Longest streak, 30-day completion rate
- Actions for current selected date:
  - Mark Done / Undone
  - Skip Day (with optional note input)
  - Freeze Day (preserve streak)
  - Edit Habit button
  - Archive / Unarchive button
  - Delete button
- 26-week Heatmap
- Recent logs list (last 10 days with notes and kind tags)

- [ ] **Step 2: Update `HabitRow.tsx`**

- Display status badge if day is skipped (⏸️ Skipped) or frozen (❄️ Frozen).
- Clicking the habit title button opens the `HabitDetailModal`.

- [ ] **Step 3: Update `Today.tsx`**

- Wire state for `activeDetailHabit`.
- Pass `onSkip`, `onFreeze`, `onArchive`, and `onDelete` handlers to the modal.

- [ ] **Step 4: Add styles to `apps/web/src/styles.css`**

- Modal backdrop, dialog container, statistics pills, action buttons, and responsive drawer styles.

- [ ] **Step 5: Verify TypeScript and Web Build**

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

- [ ] **Step 6: Commit changes**

```bash
git add apps/web
git commit -m "feat(web): add HabitDetailModal with skip, freeze, stats and history"
```

---

### Task 4: Archive Filter and Tombstone Delete Confirmation

**Files:**
- Modify: `apps/web/src/screens/Today.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add Active vs Archived view toggle in `Today.tsx`**

- Filter habits:
  - Default view: `habits.filter(h => !h.archivedAt)`
  - Archived view: `habits.filter(h => !!h.archivedAt)`
- Add tabs or segment toggle at the top of the list when archived habits exist.
- Archived habits allow "Unarchive" action.

- [ ] **Step 2: Add confirmation dialog for Delete**

- Deleting prompts: "Are you sure you want to delete this habit? All history will be permanently hidden."
- On confirmation, calls `repo.removeHabit(id)` which sets tombstone `deletedAt`.

- [ ] **Step 3: Verify TypeScript and Web Build**

```bash
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

- [ ] **Step 4: Commit changes**

```bash
git add apps/web
git commit -m "feat(web): add archive filter and delete confirmation flow"
```

---

### Task 5: End-to-End Verification & Verification Gate

**Files:**
- Run test suites and verify all automated checks pass.

- [ ] **Step 1: Run core test suite**

```bash
node --test --experimental-strip-types packages/core/test/*.test.ts
```

- [ ] **Step 2: Run typecheck**

```bash
bun run --cwd apps/web typecheck
```

- [ ] **Step 3: Run production build**

```bash
bun run --cwd apps/web build
```

- [ ] **Step 4: Final commit and status check**

```bash
git status
```
