# Sub-project 1: Self-hosted backend, login, cloud sync

Part of: (1) this, (2) desktop .dmg/.exe via Tauri, (3) mobile via Expo, (4) store release. Each has its own spec.

## Goal

Users sign in (email/password, Google, Apple) and their habits sync across devices through a self-hosted PocketBase server. The app keeps working offline and without an account.

## Decisions

- **Backend:** PocketBase, version pinned (it is pre-1.0; upgrades can break APIs). Behind Caddy for TLS. Data dir on a persistent volume. Backups: PocketBase scheduled backups to S3-compatible storage, copy kept off the VPS.
- **Auth:** PocketBase built-in `users` collection. Email/password plus OAuth2 providers Google and Apple, configured in the admin UI. Account deletion removes all of the user's records (cascade).
- **Data:** one collection `records` with fields `user` (relation to users, cascade delete), `entity` (`habits` | `habit_logs`), `cid` (client UUIDv7, unique per user and entity), `version` (text), `data` (JSON, the full client record). Deviation from `schema.sql`: no per-column mapping on the server, so client record shapes can evolve without server migrations. `user_settings` is not synced yet; rollover stays a per-device setting.
- **Version:** `versionOf(record) = max(updatedAt ?? createdAt, deletedAt)` (ISO strings). Last write wins per record by version; on a tie a tombstone wins. Logs are insert-only plus tombstone, so they never conflict. Field-level merge is deferred.
- **Sync model:** state-based, no queue. A record is dirty when `versionOf(record) !== synced[id]`. `sync()` = push dirty records (upsert by `cid`, server keeps the higher version), then pull records with `updated >= cursor` in pages and merge with LWW. Safe to repeat. A single sync runs at a time.
- **Triggers:** after login, every 30 s, on `online`, 2 s after any local change, and on a realtime subscription event.
- **Account switching:** local data belongs to an owner id. Signing in as a different user than the stored owner clears local data and sync state first, so one user's habits never upload into another account. First login from guest mode adopts the existing local data.
- **No server configured:** if `VITE_PB_URL` is unset the app behaves as today (local only, no login).

## Code layout

- `packages/core/src/repo.ts`: add `snapshot()`, `merge()`, `subscribe()` to the local repos (`LocalRepo`), `versionOf`.
- `packages/core/src/sync.ts`: `SyncEngine`, `SyncTransport`, `SyncState`, state persistence.
- `packages/core/src/pocketbase-transport.ts`: transport over a minimal `PbLike` interface (core stays dependency-free).
- `backend/pocketbase/pb_migrations/1_records.js`: collection and API rules. `backend/pocketbase/README.md`: deploy, providers, backups.
- `apps/web/src/cloud.ts`, `sync-runner.ts`, `screens/Login.tsx`, `App.tsx`: client wiring.

## Security rules

- API rules on `records`: list/view/update/delete only where `user = @request.auth.id`; create only with `@request.body.user = @request.auth.id`; `user` cannot be changed on update.
- Filter values sent to PocketBase are quoted and escaped.
- Remote data is validated (known entity, string id) before merge; invalid items are skipped.

## Testing

- Core unit tests: repo merge (LWW, tombstone tie, invalid input), engine against a fake transport (push, pull paging, idempotence, error leaves state consistent, single flight), two-device convergence with offline edits, PocketBase transport against a fake `PbLike`.
- Web: build, plus browser check that the login screen renders when `VITE_PB_URL` is set and that local-only mode is unchanged when it is not.
- Not covered until a PocketBase binary is available: the migration and API rules against a real server, and OAuth flows (need provider credentials).

## Out of scope

Push notifications, desktop and mobile apps, store release, field-level merge, `user_settings` sync, email verification and password reset UI.
