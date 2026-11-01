# HelloHabit-inspired Features Implementation Plan

**Goal:** Extend the existing local-first tracker with useful habit and planning features, delivered in independently verifiable stages.

**Architecture:** Reuse the existing core repository, tombstones, logical dates and PocketBase sync. Introduce a data-model change only when a feature needs it, with compatible migrations and tests.

**Tech Stack:** TypeScript, React, Vite, PocketBase, Node test runner.

## Stages

- [x] **Notes and journal:** Pass the existing note field to completion check-ins; show live notes from active and archived habits, filtered by habit. Verify optional note storage, typecheck and build.
- [ ] **Reminders:** Multiple times per habit are saved and used by in-app browser notifications, with fallback for the existing single time. Next design independent schedules and reliable background delivery, including denied permissions, inactive browsers and offline use; preserve compatibility with existing synced habits.
- [ ] **Calendar and statistics:** Day/week/month activity history is available using logical dates and existing logs, including archived habits. Add the remaining aggregate statistics and verify rollover, timezone and empty periods.
- [ ] **Timers:** Add stopwatch and countdown for time-based habits; define background behavior and ensure results create normal check-ins without duplicate saves.
- [ ] **Task lists:** Design separate task records, ordering, completion and tombstones; add migrations, sync and tests before UI.
- [ ] **Extended goals:** Specify monthly/yearly targets and quit tracking, then extend scheduling and streak calculations with boundary tests.

Every stage requires core tests, web typecheck and production build. Reassess scope and ordering after testing the preceding stage. HelloHabit features are based on its public listing; its exact behavior remains unverified.
