-- Habit Tracker schema. Portable subset: runs on SQLite (client, all platforms) and Postgres (server).
-- Conventions:
--   ids          UUIDv7 TEXT, generated on device, time-sortable, idempotent for retries.
--   timestamps   ISO-8601 UTC TEXT.
--   hlc          hybrid logical clock, zero-padded: '<wall_ms:15d>.<counter:5d>.<device_id>'.
--                Plain string compare gives causal order.
--   field_hlc    JSON map {column: hlc}. Field-level last-write-wins merge for mutable config rows.
--   deleted_at   tombstone. Hard-purge only after every device has acked past it.

-- ---------------------------------------------------------------------------
-- devices: one row per install. Push token drives silent-push dismissal.
-- ---------------------------------------------------------------------------
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('macos', 'windows', 'ios', 'android', 'web')),
  name          TEXT NOT NULL,
  push_token    TEXT,                 -- APNs / FCM / Web Push endpoint. NULL on desktop without push.
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL,
  revoked_at    TEXT
);

-- ---------------------------------------------------------------------------
-- user_settings: one row per user. Day-boundary inputs live here.
-- ---------------------------------------------------------------------------
CREATE TABLE user_settings (
  user_id           TEXT PRIMARY KEY,
  timezone          TEXT NOT NULL DEFAULT 'UTC',                  -- IANA id, e.g. 'Asia/Bangkok'
  rollover_minutes  INTEGER NOT NULL DEFAULT 0
                    CHECK (rollover_minutes BETWEEN 0 AND 1439),  -- 240 = 04:00 day boundary
  reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0, 1)),
  field_hlc         TEXT NOT NULL DEFAULT '{}',
  hlc               TEXT NOT NULL,
  device_id         TEXT NOT NULL REFERENCES devices (id),
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);

-- ---------------------------------------------------------------------------
-- habits: definition. Schedule is flattened so both SQL and ORM read it easily.
-- ---------------------------------------------------------------------------
CREATE TABLE habits (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('boolean', 'quantitative')),
  target          REAL NOT NULL DEFAULT 1 CHECK (target > 0),   -- boolean = 1
  unit            TEXT,                                          -- 'ml', 'pages', NULL for boolean
  step            REAL CHECK (step > 0),                         -- amount per tap; NULL = about a tenth of target
  schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekdays', 'times_per_week')),
  schedule_days   TEXT,                                          -- JSON array of ISO weekdays 1..7
  times_per_week  INTEGER CHECK (times_per_week BETWEEN 1 AND 7),
  start_date      TEXT NOT NULL CHECK (length(start_date) = 10),   -- logical date YYYY-MM-DD
  reminder_time   TEXT,                                          -- 'HH:MM' local wall clock; NULL = none
  icon            TEXT,                                          -- one emoji; NULL = none
  color           TEXT CHECK (color IN ('green', 'teal', 'blue', 'purple', 'pink', 'red', 'orange', 'yellow')),  -- NULL = green
  sort_order      REAL NOT NULL DEFAULT 0,
  archived_at     TEXT,
  field_hlc       TEXT NOT NULL DEFAULT '{}',
  hlc             TEXT NOT NULL,
  device_id       TEXT NOT NULL REFERENCES devices (id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  CHECK ((schedule_type = 'weekdays') = (schedule_days IS NOT NULL)),
  CHECK ((schedule_type = 'times_per_week') = (times_per_week IS NOT NULL))
);
CREATE INDEX habits_user_sync ON habits (user_id, hlc);

-- ---------------------------------------------------------------------------
-- habit_logs: append-only facts. Insert-only means concurrent devices never conflict.
-- Quantitative habits sum multiple logs per day. Boolean habits use one log.
-- ---------------------------------------------------------------------------
CREATE TABLE habit_logs (
  id                TEXT PRIMARY KEY,                       -- UUIDv7, client-generated idempotency key
  user_id           TEXT NOT NULL,
  habit_id          TEXT NOT NULL REFERENCES habits (id),
  logical_date      TEXT NOT NULL CHECK (length(logical_date) = 10),   -- YYYY-MM-DD, rollover applied
  kind              TEXT NOT NULL CHECK (kind IN ('complete', 'skip', 'freeze')),
  value             REAL NOT NULL DEFAULT 1 CHECK (value >= 0),
  occurred_at       TEXT NOT NULL,                          -- UTC instant the user acted
  tz                TEXT NOT NULL,                          -- IANA zone used to derive logical_date
  rollover_minutes  INTEGER NOT NULL,                       -- boundary used to derive logical_date
  is_retroactive    INTEGER NOT NULL DEFAULT 0 CHECK (is_retroactive IN (0, 1)),
  hlc               TEXT NOT NULL,
  device_id         TEXT NOT NULL REFERENCES devices (id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);
CREATE INDEX habit_logs_by_day ON habit_logs (user_id, habit_id, logical_date) WHERE deleted_at IS NULL;
CREATE INDEX habit_logs_user_sync ON habit_logs (user_id, hlc);

-- ---------------------------------------------------------------------------
-- sync_outbox: CLIENT ONLY. Local writes queue here until the server acks.
-- Rows are deleted on ack. The app writes entity row + outbox row in one transaction.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_outbox (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,            -- Postgres: GENERATED ALWAYS AS IDENTITY
  mutation_id  TEXT NOT NULL UNIQUE,                         -- UUIDv7, server dedupes on this
  entity       TEXT NOT NULL CHECK (entity IN ('habits', 'habit_logs', 'user_settings')),
  entity_id    TEXT NOT NULL,
  op           TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  payload      TEXT NOT NULL,                                -- JSON row snapshot at write time
  hlc          TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'inflight', 'failed'))
);
CREATE INDEX sync_outbox_pending ON sync_outbox (status, seq);

-- ---------------------------------------------------------------------------
-- applied_mutations: SERVER ONLY. Makes push idempotent. Retried batches are no-ops.
-- ---------------------------------------------------------------------------
CREATE TABLE applied_mutations (
  mutation_id  TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  device_id    TEXT NOT NULL REFERENCES devices (id),
  applied_at   TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- scheduled_reminders: CLIENT ONLY. Tracks OS notifications so a remote completion can cancel them.
-- ---------------------------------------------------------------------------
CREATE TABLE scheduled_reminders (
  habit_id         TEXT NOT NULL REFERENCES habits (id),
  logical_date     TEXT NOT NULL,
  fire_at          TEXT NOT NULL,                           -- UTC
  notification_id  TEXT NOT NULL,                           -- OS notification identifier
  PRIMARY KEY (habit_id, logical_date)
);
