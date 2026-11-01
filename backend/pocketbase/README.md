# Habit backend (PocketBase)

Self-hosted auth and cloud storage for the habit apps. One binary, one SQLite file.

**Status:** written but not yet run against a real server. Do the "Verify" section before trusting it.
PocketBase is pre-1.0, so pin the exact version you test with (`PB_VERSION` below) and read release notes before upgrading.

## What it provides

- `users` (built-in): email/password, Google, Apple.
- `records` (from `pb_migrations/1_records.js`): one row per synced habit or log, owned by one user. Deleting a user cascades to their rows.

## Run locally

```bash
PB_VERSION=<pinned version>   # check https://github.com/pocketbase/pocketbase/releases
# download the release zip for your OS from GitHub, unzip into backend/pocketbase/, then:
cd backend/pocketbase
./pocketbase serve --http=127.0.0.1:8090
```

Migrations in `pb_migrations/` apply on start. Open `http://127.0.0.1:8090/_/` to create the first superuser.

Point the web app at it:

```bash
echo 'VITE_PB_URL=http://127.0.0.1:8090' > apps/web/.env.local
```

## Sign-in providers (Admin UI → Collections → users → Options)

- **Email/password:** on by default. Turn on "Require email verification" only after you configure SMTP (Settings → Mail).
- **Google:** create an OAuth client (Web application) in Google Cloud Console. Authorised redirect URI: `https://<your-domain>/api/oauth2-redirect`. Paste client id and secret in the provider settings.
- **Apple:** needs an Apple Developer account (Services ID, Team ID, Key ID, private key). Return URL: `https://<your-domain>/api/oauth2-redirect`. Apple's client secret is a short-lived token, so check the PocketBase docs for how it is generated and renewed.
- **Account deletion:** confirm the `users` collection's delete rule is `id = @request.auth.id` so a signed-in user can delete themselves.

## Deploy (VPS)

1. Small Linux VPS, a domain pointing at it, Caddy installed.
2. Copy the binary and `pb_migrations/` to `/opt/habit-pb/`. Create a user `pocketbase`.
3. `/etc/systemd/system/habit-pb.service`:

```ini
[Unit]
Description=Habit PocketBase
After=network.target

[Service]
User=pocketbase
WorkingDirectory=/opt/habit-pb
ExecStart=/opt/habit-pb/pocketbase serve --http=127.0.0.1:8090
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

4. `/etc/caddy/Caddyfile` (TLS is automatic):

```
api.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

5. `systemctl enable --now habit-pb`, then create the superuser at `https://api.example.com/_/`.

## Backups

- Admin UI → Settings → Backups: enable a daily schedule and an S3-compatible bucket. Keep a copy off the VPS.
- Test a restore once before you rely on it. A backup you have not restored is not a backup.
- Keep `pb_data/` on persistent disk. Never on ephemeral container storage.

## Verify (not yet done)

With a local server running and a test user created:

1. Migration applied: `records` exists with the fields and unique index from `1_records.js`.
2. As user A, `POST /api/collections/records/records` with `user` = A succeeds. With `user` = B it is rejected.
3. As user B, list and view of A's rows return nothing; update and delete of A's rows are rejected.
4. Delete user A → A's rows are gone.
5. Run two browsers against the web app and watch habits converge.
