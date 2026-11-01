# Habit Tracker: Architecture and Roadmap

## 1. Stack (opinionated)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One domain model across all targets |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, cached builds, no Nx overhead |
| Web + PWA | Vite + React + `vite-plugin-pwa` | Simplest responsive SPA with offline shell |
| Desktop (macOS / Windows) | Tauri 2 wrapping the web build | Native tray / menu bar, global shortcuts, small binaries |
| Mobile (iOS / Android) | Expo (React Native) + `expo-sqlite` | Push, background tasks, one codebase |
| Local DB | SQLite everywhere (`expo-sqlite`, `better-sqlite3`/Tauri SQL plugin, `wa-sqlite` + OPFS on web) | One schema, one query layer |
| Sync | **PowerSync** client SDKs + Supabase Postgres | Battle-tested offline queue and streaming to all clients |
| Backend | Supabase (Postgres, Auth, Edge Functions, Realtime) | Managed; Edge Function handles idempotent upload and push fan-out |
| Push | APNs / FCM via Edge Function; Web Push for PWA | Silent pushes drive cross-device dismissal |
| Domain logic | `packages/core` (pure TS, zero deps) | Logical-date and streak code shared by every client and the server |

**Trade-off to accept:** PowerSync gives the sync engine for free, but you do not own the upload-queue internals. If you later need custom merge rules beyond field-level LWW, the outbox and HLC design in §3 still applies, and you can swap PowerSync for a custom Postgres + WebSocket relay without touching the domain code.

Alternative considered: Flutter + Drift + custom sync. Rejected: a solo dev gets less from a Dart-only stack when the web dashboard and desktop tray also need a first-class UI.

## 2. Monorepo tree

```
habit/
├─ package.json                 # root scripts: test, build, lint (turbo)
├─ pnpm-workspace.yaml          # packages/*, apps/*
├─ turbo.json
├─ packages/
│  ├─ core/                     # PURE domain logic. No I/O, no framework imports.
│  │  ├─ src/logical-date.ts    # rollover + timezone -> YYYY-MM-DD        [implemented]
│  │  ├─ src/streak.ts          # daily / weekdays / times_per_week streaks [implemented]
│  │  ├─ src/types.ts           # Habit, HabitLog, Schedule, Hlc (shared)
│  │  ├─ src/hlc.ts             # hybrid logical clock: tick, merge, compare
│  │  └─ test/core.test.ts      # [implemented] node:test, no framework
│  ├─ db/
│  │  ├─ schema.sql             # portable SQLite / Postgres schema        [implemented]
│  │  ├─ src/client.ts          # local DB open, migrations, typed queries
│  │  ├─ src/repo.ts            # habitRepo, logRepo: write row + outbox row in one txn
│  │  └─ migrations/            # numbered .sql files, applied by the client on boot
│  ├─ sync/
│  │  ├─ src/connector.ts       # PowerSync connector: fetch creds, uploadData -> Edge Fn
│  │  └─ src/merge.ts           # field-level LWW merge for habits / user_settings
│  └─ ui/                       # shared React components (headless hooks + web/native views)
├─ apps/
│  ├─ web/                      # Vite PWA: full dashboard, heatmap, settings
│  ├─ desktop/                  # Tauri 2 shell around apps/web build
│  │  └─ src-tauri/             # tray / menu bar, global shortcut plugin, autostart
│  ├─ mobile/                   # Expo app: reminders, push, widget bridge
│  │  ├─ widgets-ios/           # WidgetKit extension (Swift), reads App Group SQLite
│  │  └─ widgets-android/       # App Widget (Kotlin), reads the same SQLite file
└─ backend/
   ├─ supabase/
   │  ├─ migrations/            # the same schema.sql translated to Postgres
   │  ├─ sync-rules.yaml        # PowerSync: which rows each user may sync
   │  └─ functions/
   │     ├─ upload/             # idempotent batch apply, mutation_id dedupe
   │     └─ push-fanout/        # silent push to other devices on completion
```

Platform split: `packages/core`, `packages/db`, `packages/sync` run on every target unchanged. UI is shared only where it is pure React. Native screens are written per platform. Widgets cannot run JS, so they read SQLite directly.

## 3. Data model and sync rules

Schema: [`packages/db/schema.sql`](../packages/db/schema.sql). Summary:

- `habits`: definition with flattened schedule (`schedule_type`, `schedule_days`, `times_per_week`), `target`, `unit`, `start_date`.
- `habit_logs`: **append-only** facts keyed by UUIDv7. Each log carries `logical_date` plus the `occurred_at` UTC instant, `tz`, and `rollover_minutes` used to derive it.
- `user_settings`: `timezone`, `rollover_minutes`. Changing rollover never rewrites history, because each log already stored its own `logical_date`.
- `devices`: one per install, holds `push_token`.
- `sync_outbox` (client only), `applied_mutations` (server only), `scheduled_reminders` (client only).

Conflict rules (deterministic, no user prompts):

| Entity | Rule | Why |
|---|---|---|
| `habit_logs` | Insert-only, id = UUIDv7. Delete = tombstone. Quantitative habits sum all live logs per day. | Concurrent offline logs from two devices both survive. No lost updates. |
| `habits`, `user_settings` | Field-level LWW using `field_hlc` map. Each field keeps the value with the greater HLC. | Renaming on Mac while changing reminder on iOS keeps both edits. |
| Deletes | Tombstone (`deleted_at`) beats any older write. Purge after all devices ack. | Prevents resurrection. |

**HLC format:** `<wall_ms zero-padded 15>.<counter zero-padded 5>.<device_id>`. String comparison equals causal order, so the server can compare with plain `>`. On receive, `hlc.merge(remote)` advances the local clock, which keeps it causal across skewed device clocks.

## 4. Mutation and sync lifecycle

```
 [Device A, offline or online]
 1. User taps "done" on habit H for today
 2. Compute logical_date = toLogicalDate(now, {tz, rollover})          (core)
 3. BEGIN
      INSERT habit_logs (id=uuidv7, logical_date, occurred_at, tz, ...)
      INSERT sync_outbox (mutation_id=uuidv7, entity='habit_logs', op='upsert', payload, hlc)
    COMMIT                                                              -- UI re-renders from local DB
 4. Streak recomputed from local logs (evaluateStreak)                  (core)

 [Sync loop, runs when online, retries with backoff]
 5. Outbox batch (status -> 'inflight') -> POST /functions/upload
 6. Server, one transaction per batch:
      - skip any mutation_id already in applied_mutations (idempotent)
      - upsert rows (habit_logs insert-only; habits/settings field-level merge)
      - insert applied_mutations
 7. Ack -> client deletes outbox rows. Failure -> status 'failed', attempts++, retry
 8. Postgres logical replication -> PowerSync streams the changed rows to every
    other connected device (WebSocket). Web and desktop UIs update live.

 [Cross-device notification suppression]
 9. Server trigger on habit_logs insert (kind='complete') enqueues push-fanout
10. push-fanout selects devices where user_id matches and device_id != origin
    and push_token IS NOT NULL
11. Send SILENT push {type:'dismiss', habit_id, logical_date} via APNs
    (content-available: 1, no alert) / FCM (data-only, high priority)
12. Device handler: cancel OS notification for scheduled_reminders(habit_id, logical_date),
    delete that row. Desktop/web: close the Notification and clear the tray badge.
13. Backstop: when a reminder fires, the device checks local habit_logs first and
    stays silent if the day is already complete. Covers offline devices that
    never got the push.
```

Offline behavior: steps 1–4 need no network. Step 12 is best-effort. Step 13 is the guarantee.

## 5. Streak and day semantics (implemented in `packages/core`)

- **Logical date:** local wall-clock time minus `rollover_minutes`. Night owl with 04:00 rollover at 02:00 on Nov 2 counts toward Nov 1. Compared as wall-clock time of day, so DST transitions are handled.
- **Schedules:** `daily`; `weekdays` (ISO 1..7); `times_per_week` (Mon–Sun ISO weeks, count per week).
- **Completion:** sum of `complete` values on a logical day ≥ `target`. Boolean habits use `target = 1`.
- **Skip / freeze:** `skip` and `freeze` logs are excused. They neither add to nor break the streak. Each excused day lowers the weekly required count by one.
- **Open today:** today or the current week that is not yet satisfied never breaks the streak.
- **Retroactive:** a log with an earlier `logical_date` is just another row. The engine is pure over logs, so streaks recompute correctly no matter when the row arrived.
- **Habit catalog:** `packages/core/src/templates.ts` ships 37 ready-made activities across 8 categories (health, fitness, mind, learning, productivity, home, social, finance). Picking one pre-fills name, target, unit, schedule and reminder time. Stored habits keep the template `id` as an optional origin tag. The list is original, not copied from other apps (Loop Habit Tracker is GPLv3, which would force the whole app to GPLv3).
- **Heatmap:** a view over the same data: group live `habit_logs` by `logical_date`, sum `value`, divide by `target`, and bucket into 0–4 levels.
- **Limits in v1:** freezes are not budgeted (a user could freeze every day). Add a per-week freeze budget in Phase 3. The first partial week of a `times_per_week` habit is not evaluated.

## 6. Phased roadmap

**Phase 1 — Core and local-first web (about 2 weeks)**
- Done: `logical-date` and `streak` with 10 passing tests; `schema.sql` validated in SQLite.
- Wire `packages/db` to SQLite (Tauri SQL plugin on desktop, `wa-sqlite` on web). Migrations runner.
- `apps/web`: habit CRUD, check-in, retroactive check-in, streak badges, offline-first (service worker).
- Done when: all writes work with the network off and reload preserves state.

**Phase 2 — Sync (about 2 weeks)**
- Supabase project, Postgres schema from `schema.sql`, PowerSync sync rules scoped to `user_id`.
- Connector `uploadData` → `upload` Edge Function. Idempotency via `applied_mutations`.
- Field-level HLC merge for `habits` and `user_settings`. Property-test with two simulated devices and random partitions.
- Done when: two browsers converge after going offline and making conflicting edits.

**Phase 3 — Desktop and mobile (about 3 weeks)**
- `apps/desktop`: Tauri tray (Windows) / menu bar (macOS), global shortcut to check in the most recent habit, autostart.
- `apps/mobile`: Expo, local reminders, FCM/APNs registration, silent-push dismissal (steps 9–13).
- Heatmap view, freeze budget, rollover setting UI.
- Done when: completing on Mac cancels the iPhone reminder within a few seconds, and within the backstop window if the phone is offline.

**Phase 4 — Widgets and hardening (about 2 weeks)**
- iOS WidgetKit and Android App Widget read the shared SQLite file. Widgets write via deep link to the app, or via App Intents on iOS 17+. Direct write from the widget process needs an App Group and a shared-file lock, so measure before committing to it.
- Outbox GC, tombstone purge, schema migration tests, load test of the upload function.
- Done when: a widget tap is reflected on every other device within the sync window.

## 7. Bootstrap commands

These create the project skeleton. Only `packages/core` has been run and tested here. Run the rest in order and check each output.

```bash
# toolchain
npm i -g pnpm@9 turbo
node -v   # 22 LTS or newer

# repo
cd /Users/up-mac/wokrspace/mind/habit
git init -b main
printf 'node_modules\ndist\n.turbo\n*.sqlite\n.env*\n' > .gitignore
printf 'packages:\n  - "packages/*"\n  - "apps/*"\n  - "backend/*"\n' > pnpm-workspace.yaml

# web (Phase 1)
pnpm create vite@latest apps/web -- --template react-ts
pnpm -F web add vite-plugin-pwa workbox-window

# desktop (Phase 3)
mkdir -p apps/desktop && cd apps/desktop && pnpm dlx @tauri-apps/cli@latest init && cd ../..

# mobile (Phase 3)
pnpm create expo-app@latest apps/mobile --template blank-typescript
pnpm -F mobile add expo-sqlite expo-notifications

# sync and db (Phase 2)
pnpm -F @habit/db add @powersync/web @powersync/react-native
pnpm -F @habit/sync add @supabase/supabase-js

# supabase (Phase 2)
brew install supabase/tap/supabase
supabase init --workdir backend
supabase start

# verify the core
pnpm -F @habit/core test
```

Run `pnpm install` once after the workspace file exists. Any package in `packages/` needs `"name": "@habit/<dir>"` in its `package.json`. `core` already has it.

## 8. Risks

- **Widget write path:** iOS and Android widgets cannot run the sync engine. Writes go through the app or App Intents. Check this in Phase 4 before promising instant widget check-ins.
- **Silent push reliability:** APNs throttles silent pushes and iOS may drop them. The local backstop (step 13) is required, not optional.
- **PowerSync lock-in:** upload and sync internals are theirs. Keep all domain writes behind `packages/db/repo.ts` so a swap touches one package.
- **Clock skew:** HLC bounds skew for ordering, but `logical_date` depends on device time zone and clock. A device with a badly wrong clock can log on the wrong day. Show the logical date in the UI before saving retroactive check-ins.
