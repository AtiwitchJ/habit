# Design Spec: Habit Lifecycle Management & Core Exposure

**Date:** 2026-11-01  
**Status:** Approved  
**Author:** AI Agent & User  
**Scope:** `packages/core`, `apps/web`, `packages/db`

---

## 1. Goal

Provide full lifecycle management for habits (Edit, Delete with tombstones, Archive, and Reorder), expose the core engine's existing `skip` and `freeze` excused-day mechanisms directly in the Web UI, and enable a dedicated Habit Detail & History view.

---

## 2. Problem Statement

1. Currently, users can only **create** habits and log `complete` increments. If they make a typo, want to change their target, or retire a habit, there is no UI to edit, delete, or archive.
2. The streak calculation engine (`streak.ts`) already has robust mathematical rules for `skip` and `freeze` logs (excused days that protect streaks during illness, travel, or planned rest), but `checkin.ts` and `Today.tsx` only support `complete`.
3. The 26-week heatmap is tucked under the Today list for a single selected habit, with no way to view check-in logs, notes, or lifetime stats.

---

## 3. Architecture & Data Contracts

### 3.1 Domain Extensions (`packages/core`)

#### `HabitRecord` Additions (`packages/core/src/repo.ts`)
```ts
export interface HabitRecord {
  id: string;
  name: string;
  kind: 'boolean' | 'quantitative';
  target: number;
  unit?: string;
  step?: number;
  schedule: Schedule;
  startDate: LogicalDate;
  color?: Hue;
  icon?: string;
  archivedAt?: string; // ISO string when archived; hidden from Today
  order?: number;      // Sort ordering
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;  // Tombstone for sync
}
```

#### `LogRecord` Additions (`packages/core/src/repo.ts`)
```ts
export interface LogRecord {
  id: string;
  habitId: string;
  logicalDate: LogicalDate;
  kind: 'complete' | 'skip' | 'freeze';
  value: number;
  note?: string;       // Optional check-in journal note
  occurredAt: string;
  isRetroactive: boolean;
  createdAt: string;
  deletedAt?: string;
}
```

#### New Domain Helpers (`packages/core/src/checkin.ts`)
```ts
// Excuses a day without breaking streak
export async function skipDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, note?: string): Promise<void>;
export async function freezeDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate, today: LogicalDate, note?: string): Promise<void>;
export async function removeExcusedDay(repo: HabitRepo, habit: HabitRecord, date: LogicalDate): Promise<void>;
```

#### Habit Stats Helper (`packages/core/src/summary.ts`)
```ts
export interface HabitDetailStats {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  completionRate30d: number; // 0 to 100 percentage
}

export function computeHabitStats(habit: HabitRecord, logs: LogRecord[], today: LogicalDate): HabitDetailStats;
```

---

## 4. Web UI Specifications (`apps/web`)

### 4.1 Screen & Component Flow

1. **`HabitRow.tsx` Enhancements:**
   - Visual indicators for `done`, `skipped` (⏸️), or `frozen` (❄️).
   - Action trigger: Tapping on habit title opens `HabitDetailModal`.

2. **`HabitDetailModal.tsx` (New Component):**
   - Displays icon, name, schedule description, current & longest streak badges.
   - Quick Actions:
     - **Check-in / Step stepper**
     - **Skip Today** / **Freeze Today** (with optional note input)
     - **Edit Habit** (opens `EditHabit` screen/modal)
     - **Archive Habit** (toggles `archivedAt`)
     - **Delete Habit** (confirms, sets `deletedAt` tombstone)
   - Embedded 26-week interactive heatmap.
   - Recent log history list (last 14 active logs with notes and timestamps).

3. **`EditHabit.tsx` (New Screen / Modal):**
   - Pre-filled form mirroring `AddHabit`:
     - Name
     - Emoji Icon & Hue swatch selector
     - Measurement kind, target, unit, per-tap step
     - Schedule (daily, weekdays, times per week)
   - Save updates via `repo.updateHabit(id, patch)`.

4. **`Today.tsx` Enhancements:**
   - Tabs/Toggle: "Active Habits" vs "Archived Habits".
   - Clean empty-state and error toasts.

---

## 5. Security, Sync & Non-Negotiables

- **LWW Sync:** Updates update `updatedAt` to ensure Last-Write-Wins works over PocketBase.
- **Tombstones:** Deletions set `deletedAt = new Date().toISOString()`, never physical array filtering.
- **Logical Date Invariant:** Any date evaluation uses `toLogicalDate` with user rollover boundary.
- **Pure Core:** Zero UI dependencies or browser globals in `packages/core`.

---

## 6. Verification Criteria

1. Unit tests pass:
   - `checkin.test.ts`: test `skipDay`, `freezeDay`, `removeExcusedDay`, and note preservation.
   - `summary.test.ts`: test `computeHabitStats` for streak and completion rates.
   - `repo.test.ts`: verify `updateHabit` updates `updatedAt` and keeps tombstones.
2. Web tests pass:
   - `bun run --cwd apps/web typecheck` exits with 0.
   - `bun run --cwd apps/web build` compiles production bundle with 0 errors.
