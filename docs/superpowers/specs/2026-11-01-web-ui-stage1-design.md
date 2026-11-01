# Stage 1: Web UI (Today, Add habit, heatmap)

Part of a 3-stage plan to make the habit tracker pleasant to use:
1. **This spec:** usable web UI.
2. Gamification in core (milestones, completion rate, encouragement), wired into the UI.
3. Thai catalog and goal-based starter packs.

Stages 2 and 3 get their own spec, plan, and implementation cycle.

## Goal

A user can open the web app, pick habits from the built-in catalog, check in each day, and see streaks and a heatmap. Works with the network off. No sync, no accounts.

## Scope

In:
- `apps/web`: Vite + React + TypeScript SPA, two screens (Today, Add habit).
- `HabitRepo` interface in `packages/core`, with a `localStorage` implementation in `apps/web`.
- `heatmapLevels()` in `packages/core`.
- Rollover hour setting (default 04:00), timezone from the browser.

Out (later stages): PWA service worker, SQLite, sync, desktop, mobile, notifications, milestones, Thai text, edit-after-create beyond name and target.

## Screens

**Today**
- Header: logical date for today, rollover hint ("day flips at 04:00").
- One row per habit due today: name, current streak, check-in control.
  - Boolean habit: one tap toggles done.
  - Quantitative habit: shows `value / target unit`; +/- buttons add or remove a step (step = `target / 10`, rounded to a whole number, minimum 1).
- Habits not due today appear in a collapsed "Not today" group.
- Tapping a row's date strip lets the user pick an earlier date for a retroactive check-in (up to 30 days back).
- Heatmap panel: last 26 weeks, one cell per logical day, 5 levels (0 = none, 4 = full target). Shown for the selected habit.

**Add habit**
- Catalog grouped by category (8 groups from `HABIT_TEMPLATES`), each item shows target, unit, schedule.
- Selecting an item opens a form pre-filled from the template. User can edit name and target. Schedule is kept from the template.
- "Custom habit" option: name, boolean or quantitative, target, daily only (other schedules come from the catalog).
- Start date field (date input, default today, allowed range today-30..today). Needed so retroactive check-ins before today are possible and streaks start from a sensible day.
- Saving writes the habit and returns to Today.

## Data and boundaries

- `packages/core` gains no I/O. New code:
  - `HabitRepo` (type only): `listHabits()`, `addHabit(input)`, `updateHabit(id, patch)`, `removeHabit(id)`, `listLogs(habitId)`, `addLog(input)`, `removeLog(id)`.
  - `heatmapLevels(rule, logs, from, to)`: returns `{date, level 0..4}[]`. Level = `ceil(min(value/target,1) * 4)`; days with only skip/freeze return level 0 and are not marked specially in stage 1.
- `HabitRepo` methods return Promises so a later SQLite repo needs no UI change.
- `packages/core` also holds `createMemoryRepo` and `createStorageRepo(storage)` (memory repo that loads from and saves to a `StorageLike` under one JSON key; storage errors are swallowed). `apps/web/src/repo-local.ts` only wires `window.localStorage` into it; if storage is unavailable the app runs on the memory repo and shows a banner. This keeps all repo logic testable with node:test.
- Record shapes mirror `habits` and `habit_logs` in `packages/db/schema.sql` (camelCase in TS). Ids are UUIDv7 generated in the browser (small inline function, no dependency). Deleted logs get `deletedAt` set rather than being removed, matching the tombstone rule.
- The UI calls `toLogicalDate` and `evaluateStreak` only. It never computes dates itself.
- Replacing `localStorage` with SQLite later changes only `repo-local.ts`.

## Error handling

- Invalid rollover or unknown timezone from settings: fall back to `UTC` / `0` and show a banner.
- Storage unavailable (private mode, quota): run in memory, banner says data will not persist.
- Check-in on a date before the habit's `startDate`: blocked in the UI.

## Testing

- Core (node:test, existing runner): `heatmapLevels` for boolean, quantitative partial/full, skip-only days, empty range.
- Repo: shared contract tests run against an in-memory `HabitRepo`; the `localStorage` version runs the same tests with a stubbed storage object.
- UI: verified by running the dev server and exercising add, check-in, retroactive check-in, and reload persistence in the browser. No component test framework in stage 1.

## Success criteria

- Fresh load shows an empty Today with a clear "Add your first habit" action.
- Adding "Drink water" from the catalog, logging 2000 ml across multiple taps, shows it done and streak 1.
- Reload keeps data. Network off changes nothing.
- A retroactive check-in on yesterday updates the streak immediately.
- All core and repo tests pass.

## Decisions made without asking

- `localStorage` for stage 1 storage, behind `HabitRepo`.
- Heatmap for one selected habit, not an overall view.
- Retroactive window of 30 days.
- No component test framework.
