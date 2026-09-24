-- Initial schema (docs/01-architecture.md §6).
-- Timestamps are ISO-8601 UTC strings; JSON columns hold validated documents.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,           -- 'locale','timezone','location','power_mode','rotation', ...
  value TEXT NOT NULL               -- JSON
);

CREATE TABLE api_tokens (
  id          TEXT PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('admin','device')),
  label       TEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE, -- SHA-256 of the token; the token itself is never stored
  created_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT
);

CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL CHECK (provider IN ('google','microsoft')),
  external_id   TEXT NOT NULL,      -- provider subject id
  display_name  TEXT,               -- shown only in admin
  refresh_token_enc TEXT NOT NULL,  -- AES-GCM(base64), key from Worker secret
  scopes        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','reauth_required')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE TABLE sources (              -- a calendar or a task list
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('calendar','task_list')),
  remote_id   TEXT NOT NULL,        -- Google calendarId / Graph list id
  label       TEXT NOT NULL,
  color       TEXT,                 -- '#rrggbb' chosen by the owner
  enabled     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (account_id, kind, remote_id)
);

CREATE TABLE layouts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  json       TEXT NOT NULL,         -- validated layout document (doc 04)
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE schedule_rules (
  id         TEXT PRIMARY KEY,
  layout_id  TEXT REFERENCES layouts(id) ON DELETE CASCADE, -- NULL = screen-off rule
  days       INTEGER NOT NULL,      -- bitmask Mon=1 … Sun=64
  from_min   INTEGER NOT NULL,      -- minutes from local midnight
  to_min     INTEGER NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE overrides (            -- manual admin override, at most one active row
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  layout_id   TEXT REFERENCES layouts(id) ON DELETE SET NULL,
  screen      TEXT CHECK (screen IN ('on','off')),
  expires_at  TEXT                  -- NULL = until cleared
);

CREATE TABLE oauth_states (
  state       TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  verifier    TEXT NOT NULL,        -- PKCE
  expires_at  TEXT NOT NULL
);

CREATE TABLE device_status (
  device_id   TEXT PRIMARY KEY,     -- derived from token id
  last_seen   TEXT NOT NULL,
  app_version TEXT,
  info        TEXT                  -- JSON: userAgent, screen size, ...
);
