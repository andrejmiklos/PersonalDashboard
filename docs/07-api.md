# 07 — HTTP API (v1)

Base: `https://<worker-host>`. JSON everywhere. Auth: `Authorization: Bearer <token>` unless noted.
Errors: `{ "error": { "code": "string", "message": "human readable" } }` with the right HTTP status.
All `/api/*` responses carry `Cache-Control: no-store`.

Roles: **A** = admin, **D** = device (admin may call everything the device can).

## 1. Static

| Path | Auth | Description |
|---|---|---|
| `/display/` | none | Tablet app shell (no data) |
| `/admin/` | none | Editor/control shell (no data; requires token to load anything) |
| `/oauth/google/callback`, `/oauth/microsoft/callback` | `state` | OAuth redirect targets |
| `/healthz` | none | `{ "ok": true }` (no version info leaked beyond build id) |

## 2. Display endpoints

### `GET /api/v1/display/state` — D, A
Headers (optional): `X-Display-Version`, `X-Display-Info` (base64 JSON, once per minute).

```json
{
  "serverTime": "2026-09-24T07:15:00Z",
  "appVersion": "1.0.3",
  "screen": "on",
  "layoutSpec": { "kind": "layout", "layoutId": "lay_1" },
  "layouts": { "lay_1": { /* full layout document */ } },
  "rotation": null,
  "touch": { "enabled": true, "cycle": ["lay_1", "lay_2"], "timeoutSec": 300 },
  "locale": "sk",
  "timezone": "Europe/Bratislava",
  "power": { "mode": "scheduled" }
}
```

`layoutSpec.kind`: `layout` | `pinned` | `rotation` (`{ layoutIds, secondsEach, anchor }`); `null` when no layout
is configured. Supports `If-None-Match` with ETag → `304`; the ETag covers everything except `serverTime`.
Phase 2 serves `settings.defaultLayoutId` only; schedule, overrides, rotation and power follow in Phase 5.

### `POST /api/v1/display/pair` — no token
Body `{ "code": "K7QM-2XPA" }` (case, spaces and dashes ignored). Exchanges a one-time pairing code
(`npm run pair`) for a new device token: `201 { "token": "dsh_device_…" }`. Every failure is
`400 invalid_code`; 10 failures lock the active code (doc 06 §2.1).

### `POST /api/v1/display/heartbeat` — D, A
Optional separate heartbeat if the state poll is throttled; body `{ "version": "…", "info": { … } }`.

## 3. Data endpoints (tile data)

Response envelope: `{ "updatedAt": "ISO", "ttl": 180, "data": … }`.

| Endpoint | Query | Notes |
|---|---|---|
| `GET /api/v1/data/calendar` | `sources=id1,id2&days=3` | Events, merged, sorted |
| `GET /api/v1/data/tasks` | `sources=id1,id2&completed=0` | Tasks by list |
| `GET /api/v1/data/weather` | — | Location from settings |
| `GET /api/v1/data/air` | — | AQI + pollen |
| `GET /api/v1/data/astro` | `date=YYYY-MM-DD` (optional) | Sun/moon |
| `GET /api/v1/data/quote` | `lang=sk|en` (optional) | Today's quote |

Provider failure with usable cache → `200` with `"stale": true`; without → `503` `provider_unavailable`;
account needs re-auth → `409` `reauth_required` with `{ "accountId": "…" }`; weather/air/astro without a
location in settings → `409` `location_not_set`.

`data/weather` payload (`WeatherData`, times local to the configured zone):

```json
{
  "current": { "time": "2026-01-15T14:15", "temperature": 3.4, "feelsLike": 0.9, "code": 3, "isDay": true,
               "windSpeed": 12.5, "precipitation": 0 },
  "hourly": [{ "time": "2026-01-15T15:00", "temperature": 3.1, "precipitationProbability": 10, "code": 61, "isDay": true }],
  "daily": [{ "date": "2026-01-15", "code": 71, "min": -2, "max": 4, "precipitationProbability": 40 }]
}
```

`hourly` holds the 8 hours after the current one, `daily` today + 5 days; missing model values are `null`.

`data/astro` computes `AstroData` (doc 03 §6) for `date` (default: today in the configured zone); a `date` that is
not a real `YYYY-MM-DD` between 1900 and 2199 → `400 validation_error`. `ttl` is 6 h.

### `PATCH /api/v1/tasks/:listId/:taskId` — D, A
Body `{ "completed": true | false }`. Only this field is accepted. `200` with the updated task; invalidates the
tasks cache.

## 4. Admin: layouts

| Method & path | Description |
|---|---|
| `GET /api/v1/layouts` | List `{ id, name, version, updatedAt, tileCount }` |
| `POST /api/v1/layouts` | Create (body = layout without id/version) |
| `GET /api/v1/layouts/:id` | Full document |
| `PUT /api/v1/layouts/:id` | Replace; server validates, `version += 1`; body may include `ifVersion` for optimistic concurrency → `409` on mismatch |
| `POST /api/v1/layouts/:id/duplicate` | Copy with new id and "(copy)" name |
| `DELETE /api/v1/layouts/:id` | `409` if referenced by rule/default/rotation/override |

Responses: `POST` and `duplicate` → `201` with the full document, `DELETE` → `204`. Errors: `400 validation_error`
(message names the first invalid field, e.g. `tiles.2: c1 overlaps c3`), `404 not_found` (also for malformed ids),
`409 version_conflict`, `409 layout_in_use`, `413` over 64 KB. Config defaults are filled in on save.

## 5. Admin: schedule, mode, overrides, settings

| Method & path | Description |
|---|---|
| `GET/PUT /api/v1/settings` | `{ locale, timezone, location: { label, lat, lon } \| null, powerMode, defaultMode, defaultLayoutId, rotation, touch }`. PUT changes only the fields it contains (unknown fields → `400`); coordinates are rounded to 2 decimals (~1 km). Phase 1 implements `locale`, `timezone`, `location`, `powerMode` |
| `GET/PUT /api/v1/schedule` | Full list of rules (replace semantics, validated) |
| `GET /api/v1/override` | Current override or `null` |
| `PUT /api/v1/override` | `{ layoutId?, screen?, expiresAt? \| durationSec? }` |
| `DELETE /api/v1/override` | Clear |
| `GET /api/v1/devices` | `[{ id, label, lastSeen, appVersion, info }]` |

Until the admin app exists, the CLI reads and changes settings (admin token asked for without echo):

```
npm run settings -- https://<worker-host>
npm run settings -- https://<worker-host> --location "My city" --lat 50 --lon 10
npm run settings -- https://<worker-host> --no-location
npm run settings -- https://<worker-host> --locale en --timezone Europe/Prague
```

Negative coordinates need `=`: `--lon=-3.7`.

## 6. Admin: accounts & sources

| Method & path | Description |
|---|---|
| `GET /api/v1/accounts` | `[{ id, provider, displayName, status }]` (never tokens) |
| `DELETE /api/v1/accounts/:id` | Removes account + sources (cascade) |
| `POST /api/v1/admin/oauth/:provider/start` | `provider ∈ google|microsoft`; returns `{ url }` |
| `GET /api/v1/accounts/:id/discover` | Live list of remote calendars / task lists |
| `GET /api/v1/sources` | Enabled/known sources |
| `PUT /api/v1/sources/:id` | `{ label?, color?, enabled? }`; `POST /api/v1/accounts/:id/sources` to add from discovery |

## 7. Admin: tokens

| Method & path | Description |
|---|---|
| `GET /api/v1/tokens` | `[{ id, role, label, createdAt, lastUsedAt, revokedAt }]` |
| `POST /api/v1/tokens` | `{ role, label }` → returns the token **once** |
| `DELETE /api/v1/tokens/:id` | Revoke (cannot revoke the token used for the call if it is the last admin token) |

The CLI (`scripts/token.ts`) bootstraps the first admin token when no token exists yet; it writes directly to D1
with `wrangler d1 execute` and targets the local database unless `--remote` is given:

```
npm run token:create -- --role admin --label "owner phone" --remote
npm run token:list -- --remote
npm run token:revoke -- tok_abcdefghijklmnop --remote
```

The token is generated inside the script (never a command-line argument), only its SHA-256 is sent to D1, and it is
printed once after the insert is confirmed.

## 8. Conventions

- IDs: prefixed random (`lay_`, `src_`, `acc_`, `tok_`), 12+ chars base32.
- Timestamps ISO-8601 UTC; dates `YYYY-MM-DD`.
- Pagination not needed (single-owner data).
- Versioning: `/api/v1`; breaking changes → `/v2`, with `appVersion` reload logic keeping the tablet in step.
- Rate limits: Cloudflare rule + basic per-token counter (optional).
- Request bodies: `Content-Type: application/json` (else `415`), size-limited per route (`413`), validated with zod
  (`400 validation_error`, message names the first invalid field). State-changing requests with an `Origin` other
  than the Worker's own get `403 forbidden_origin`.
