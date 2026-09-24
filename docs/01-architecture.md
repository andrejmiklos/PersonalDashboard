# 01 — Architecture

## 1. Overview

```
 ┌────────────────────┐        HTTPS        ┌──────────────────────────────────────┐
 │ Tablet (SM-T530)   │ ──── poll / PATCH ─▶│ Cloudflare Worker                    │
 │ Chrome (kiosk)     │◀──── JSON ───────── │  - static assets: /display, /admin   │
 │ /display (Chrome95)│   device token      │  - REST API  /api/v1/*               │
 └────────────────────┘                     │  - OAuth callbacks /oauth/*          │
                                            │  - provider adapters + Cache API     │
 ┌────────────────────┐        HTTPS        │                                      │
 │ Phone / PC browser │ ──── admin token ──▶│  D1 (SQLite): layouts, schedule,     │
 │ /admin (modern)    │                     │  settings, accounts (encrypted       │
 └────────────────────┘                     │  refresh tokens), API token hashes   │
                                            └───────┬───────────┬───────────┬──────┘
                                                    │           │           │
                                          Google Calendar   MS Graph    Open-Meteo
                                             API            (To Do)     (weather, air)
```

Key properties:

- **The tablet never talks to third parties and never performs OAuth.** It only knows the Worker and
  holds a low-privilege device token. All provider credentials live server-side.
- **One origin.** The Worker serves both the static apps and the API → no CORS.
- **Server-side aggregation and caching.** Providers are called at most once per TTL regardless of
  how many clients ask.
- **Tablet is stateless-ish.** It asks the server "what should I show right now?" (`/display/state`)
  and renders. Last data is cached in `localStorage` for offline resilience.

## 2. Components

### 2.1 `apps/worker` — Cloudflare Worker (TypeScript)

- Router: [Hono](https://hono.dev) (small, Workers-native).
- Modules: `auth` (token middleware, roles), `oauth` (Google/Microsoft flows), `providers/*`
  (google-calendar, ms-todo, open-meteo, astro), `layouts`, `schedule` (state resolution),
  `settings`, `cache` (Cache API wrapper), `crypto` (AES-GCM for refresh tokens).
- Validation of all request bodies (zod) — layouts validated with the shared schema.
- Cron Trigger (optional, Phase 7): warm caches, prune expired OAuth states.

### 2.2 `apps/display` — tablet runtime (TypeScript → Chrome 95 bundle)

- No framework; small render helpers. Every tile is a module implementing
  `mount(el, ctx) / update(data) / resize(box) / destroy()`.
- Layout engine: absolute positioning from grid coordinates (see doc 04).
- Data layer: `fetch`-based client with timeouts, polling scheduler per tile type, stale tracking.
- Built with Vite, `build.target: 'chrome95'` (Phase 0 measurement); no legacy plugin, no polyfills.

### 2.3 `apps/admin` — editor & control panel (TypeScript, modern browsers)

- Layout editor (drag/resize), layout list, schedule editor, live control (screen on/off,
  pin layout), account/source management, device status.
- Runs on current phone/PC browsers, so it may use modern APIs. Separate bundle from `display`.
- Framework: Preact (small; JSX ergonomics for an editor). Not used in `display`.

### 2.4 `packages/shared`

Dependency-free TypeScript: layout types + JSON schema constants, tile type registry (min/max size,
defaults), SK/EN i18n dictionaries, date-format helpers. Imported by all three apps.
(zod schemas live in `apps/worker`; `shared` only exports types and plain-data metadata to keep the
tablet bundle small.)

## 3. Data flow

### 3.1 Tablet boot

1. First run: Chrome opens `https://<worker>/display/#t=<device-token>` (typed once on the device).
   Later launches come from the home-screen shortcut (`start_url: /display/`, no token).
2. `display` reads token from the URL hash, stores in `localStorage`, strips the hash
   (`history.replaceState`). The hash is never sent to the server. Without a hash it uses the
   stored token; with neither it shows a "not paired" screen.
3. `GET /api/v1/display/state` → `{ layout, screen, rotation, serverTime, appVersion, ... }`.
4. Render layout; each tile starts its own data polling.
5. Poll `display/state` every 15 s with `If-None-Match` (usually an empty `304`); on failure back off up to 5 min.
   On `layout.version` change → re-render. On `appVersion` change → `location.reload()`, at most once per
   version within 10 min so a stale cache cannot cause a reload loop. `appVersion` is a per-build id: the
   display build bakes it into the bundle and writes `/display/version.json`, which the Worker reads through
   its `ASSETS` binding.

### 3.2 Tile data

Tile → `GET /api/v1/data/<type>?…` → Worker checks Cache API (key = type + normalised params) →
miss: call provider → normalise → cache with TTL → respond `{ updatedAt, ttl, data }`.

### 3.3 Task completion (only write path from the tablet)

Tap checkbox → optimistic UI → `PATCH /api/v1/tasks/:listId/:taskId { completed: true }` →
Worker calls Graph → on failure UI rolls back and shows a small error state.

### 3.4 Editor save

`PUT /api/v1/layouts/:id` (admin) → server validates → increments `version` → tablet picks it up
on its next state poll (≤ 15 s).

## 4. Refresh & quota budget

| Endpoint | Client poll | Server cache TTL | Calls/day (1 tablet) |
|---|---|---|---|
| `display/state` | 15 s | none (D1 read) | 5 760 |
| `data/calendar` | 120 s | 180 s | 720 (provider: ≤480 per calendar) |
| `data/tasks` | 60 s | 60 s | 1 440 |
| `data/weather` | 15 min | 15 min | 96 |
| `data/air` | 60 min | 60 min | 24 |
| `data/astro` | 6 h | 24 h (per date) | 4 |
| `data/quote` | at midnight | 24 h | 1 |

Total ≈ 8 000 Worker requests/day vs. 100 000 free. D1 free tier (5 M reads, 100 k writes/day) is
ample. `last_seen` writes are throttled to once per minute.

## 5. Offline / failure behaviour

- Each tile keeps its last successful payload in memory + `localStorage`.
- If `now - updatedAt > 2 × ttl` the tile shows a subtle "stale" indicator (dimmed + `hh:mm`).
- `display/state` failing for > 5 min → small "offline" badge in a corner; layout keeps rendering.
- Provider auth failure (`invalid_grant`) → account status `reauth_required`; tile shows
  "reconnect in admin"; admin panel shows a banner.
- Nightly soft reload (≈ 03:30) and reload on version change to avoid leaks in the old browser.

## 6. D1 schema (initial migration)

```sql
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
```

## 7. Repository layout

```
/
├─ apps/
│  ├─ worker/          Cloudflare Worker (API, OAuth, providers)
│  ├─ display/         Tablet runtime (Chrome 95 bundle)
│  └─ admin/           Editor + control panel (modern bundle)
├─ packages/
│  └─ shared/          Types, tile registry, i18n, date helpers
├─ content/
│  └─ quotes.json      Curated quotes (SK + EN)
├─ migrations/         D1 SQL migrations
├─ examples/           Sample layouts (fictional data only)
├─ scripts/            token:create, secrets helper, etc.
├─ docs/               This documentation
├─ wrangler.example.jsonc   Committed template
├─ .env.example / .dev.vars.example
└─ README.md / README.sk.md / LICENSE
```

npm workspaces; Node ≥ 22.18 (TypeScript scripts run via type stripping; `node:sqlite` in tests); TypeScript strict; ESLint + Prettier; Vitest.

## 8. Tech stack summary

| Layer | Choice | Why |
|---|---|---|
| Runtime | Cloudflare Workers | Free, no server to keep alive |
| DB | D1 (SQLite) | Strong consistency, SQL, migrations |
| Router | Hono | Tiny, typed |
| Validation | zod (worker only) | Schema-first API |
| Display build | Vite, target `chrome95` | Phase 0: tablet runs Chrome 95 |
| Admin UI | Preact + Vite | Small, modern |
| Tests | Vitest (+ `@cloudflare/vitest-pool-workers`) | Worker-accurate tests |
| Lint | ESLint, Prettier | |
| Secrets scan | gitleaks (pre-commit + CI) | Public repo |
| Deploy | `wrangler deploy` from the owner's machine | No CI secrets needed at first |

## 9. Time & locale

- Server-side date logic (schedule, "today", daily quote) uses the configured IANA timezone
  (`Europe/Bratislava`) via `Intl.DateTimeFormat` on the Worker (modern runtime).
- The tablet uses its device clock (automatic time on) and formats with `Intl.DateTimeFormat` in the
  configured timezone from `/display/state` (Chrome 95 supports `sk` locale data and IANA zones), so a
  wrong device timezone does not shift displayed times.
- API timestamps are ISO-8601 UTC; all-day events use plain dates (`YYYY-MM-DD`).
