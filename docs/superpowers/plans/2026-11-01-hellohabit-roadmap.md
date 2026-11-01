# HelloHabit-inspired Features Implementation Plan

**Goal:** Extend the existing local-first tracker with useful habit and planning features, delivered in independently verifiable stages.

**Architecture:** Reuse the existing core repository, tombstones, logical dates and PocketBase sync. Introduce a data-model change only when a feature needs it, with compatible migrations and tests.

**Tech Stack:** TypeScript, React, Vite, PocketBase, Node test runner.

## Stages

- [x] **Notes and journal:** Pass the existing note field to completion check-ins; show live notes from active and archived habits, filtered by habit. Verify optional note storage, typecheck and build.
- [x] **Reminders:** Multiple times per habit are saved and used by in-app browser notifications, with fallback for the existing single time. Next design independent schedules and reliable background delivery, including denied permissions, inactive browsers and offline use; preserve compatibility with existing synced habits.
- [x] **Calendar and statistics:** Day/week/month activity history is available using logical dates and existing logs, including archived habits. Add the remaining aggregate statistics and verify rollover, timezone and empty periods.
- [x] **Timers:** Add stopwatch and countdown for time-based habits; define background behavior and ensure results create normal check-ins without duplicate saves.
- [x] **Task lists:** Design separate task records, ordering, completion and tombstones; add migrations, sync and tests before UI.
- [x] **Extended goals:** Specify monthly/yearly targets and quit tracking, then extend scheduling and streak calculations with boundary tests.

Every stage requires core tests, web typecheck and production build. Reassess scope and ordering after testing the preceding stage. HelloHabit features are based on its public listing; its exact behavior remains unverified.


## Status (2026-11-01)

All six stages have a first version. Known limits, each a deliberate cut:

- **Reminders:** in-app only (app must be open); background delivery needs web push.
- **Calendar:** per-day counts plus period stats (`rangeStats`); a times_per_* habit counts per day, not per period.
- **Timers:** minute-unit habits only; stores the start time, so reloads keep it running. No pause, no alarm sound.
- **Tasks:** title, optional due date, done; sorted by due date, no manual reorder. New `tasks` sync entity: run `pb_migrations/2_tasks_entity.js` on the server before syncing tasks.
- **Goals:** monthly/yearly `times_per_*` and quit habits (`relapse` log). `packages/db/schema.sql` is not updated for these.
