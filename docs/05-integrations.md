# 05 — Integrations

All provider credentials live in Cloudflare secrets / D1 (encrypted) — never in the repo. Placeholders like
`<worker-host>` stand for the owner's own Worker hostname, which is intentionally not committed.

## 1. Google Calendar (OAuth 2.0, multiple accounts)

### 1.1 One-time setup (Google Cloud Console)

1. Create a project (e.g. `personal-dashboard`).
2. **APIs & Services → Library → Google Calendar API → Enable.**
3. **OAuth consent screen**: User type *External*. App name, support email (owner's).
   Scopes to add:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
4. **Publish app** → status **In production**. Why: in *Testing* status refresh tokens expire after
   7 days. In production the app remains *unverified* (Google shows a "not verified" screen once per
   account: *Advanced → Go to <app> (unsafe)*); this is fine for personal use (< 100 users), no review
   needed. Tokens then stay valid until revoked, password change with Gmail scopes not relevant here, or
   6 months of no use.
5. **Credentials → Create OAuth client ID → Web application.** Authorised redirect URI:
   `https://<worker-host>/oauth/google/callback` (and `http://localhost:8787/oauth/google/callback` for dev).
6. Store secrets: `wrangler secret put GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   (local dev: `.dev.vars`, git-ignored).

### 1.2 Connecting an account (flow)

Runs in the admin UI on the phone/PC (never on the tablet).

1. Admin UI: `POST /api/v1/admin/oauth/google/start` (admin token) → server creates `oauth_states`
   row (random `state`, PKCE `verifier`, 10 min TTL) → returns Google auth URL
   (`access_type=offline`, `prompt=consent`, scopes above, `code_challenge`).
2. Browser navigates to Google → user consents → redirect to `/oauth/google/callback?code&state`.
3. Callback (no bearer; authenticated by the single-use `state`): exchange code (+ verifier), read the
   subject id (`sub` from ID token if `openid` requested, or from calendarList primary), encrypt the
   refresh token (AES-GCM, key = `TOKEN_ENC_KEY` secret), upsert `accounts`.
4. Redirect to `/admin/#/accounts` where the user selects which calendars to enable and assigns colours.

Repeat for each Google account.

### 1.3 Data access

- Access token: cached for `expires_in − 60 s`; refreshed from the stored refresh token.
  **Open for Phase 3:** where access tokens and the last calendar/task data are cached. The Cache API does
  not reliably persist on `*.workers.dev` (D-20), and D1 holds no event/task content so far (doc 06 §8).
- `GET calendarList` → sources discovery (admin only, cached 10 min).
- Events: `GET /calendar/v3/calendars/{id}/events` with `singleEvents=true`, `orderBy=startTime`,
  `timeMin`, `timeMax`, `maxResults=250`, `fields` limited to id/summary/start/end/location/status/attendees(self,responseStatus).
  One request per enabled calendar, in parallel, merged & sorted server-side.
- Colour: from `sources.color` (owner-chosen), not Google's.
- Errors: `invalid_grant` → `accounts.status = 'reauth_required'`; 403/429 → serve stale cache, back off.

## 2. Microsoft To Do (Microsoft Graph, personal account)

### 2.1 One-time setup (Microsoft Entra admin center)

1. Sign in at entra.microsoft.com with the personal account. (Registering apps with a personal account
   may prompt for a free Azure tenant; no subscription/charge is needed.)
2. **App registrations → New registration**: name `personal-dashboard`; supported account types
   **Personal Microsoft accounts only**; redirect URI (Web): `https://<worker-host>/oauth/microsoft/callback`
   (+ localhost dev URI).
3. **Certificates & secrets → New client secret.** Secrets expire (≤ 24 months): note the expiry in a
   calendar reminder. Alternative: public-client flow with PKCE and no secret if the expiry becomes annoying.
4. **API permissions → Microsoft Graph → Delegated**: `Tasks.ReadWrite`, `offline_access`, `User.Read`.
5. Secrets: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.

Endpoints: `https://login.microsoftonline.com/consumers/oauth2/v2.0/{authorize,token}`.

### 2.2 Connect flow

Same as Google (state + PKCE, admin-initiated, encrypted refresh token). Microsoft **rotates refresh
tokens** on use — the new token must be written to D1 immediately after each refresh (single-writer:
serialise refreshes per account with a short D1 lock row or in-memory promise + retry on `invalid_grant`
by re-reading the DB). This is why D1 (strong consistency) is used instead of KV.

### 2.3 Data access

- Lists: `GET /v1.0/me/todo/lists` → sources of kind `task_list` (admin picks which to show).
- Tasks: `GET /v1.0/me/todo/lists/{id}/tasks?$filter=status ne 'completed'&$orderby=…&$top=100`
  (`$orderby` support is limited — sort on the server after fetch).
- Complete: `PATCH /v1.0/me/todo/lists/{listId}/tasks/{taskId}` with `{ "status": "completed" }`;
  uncomplete: `{ "status": "notStarted" }`.
- Only these two mutations are exposed by our API.
- Recurring tasks: completing one creates the next instance in To Do itself; the next poll picks it up.
- Errors: 401 → refresh; `invalid_grant` → `reauth_required`; 429 → honour `Retry-After`, serve stale.

## 3. Open-Meteo (weather, air quality)

- No API key; free for non-commercial use; **attribution required** (CC BY 4.0) — see tile docs.
- Forecast: `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=<tz>&forecast_days=6`
- Air: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=…&longitude=…&current=european_aqi,pm2_5,pm10&timezone=<tz>`
  (CAMS data; attribution must name CAMS and Open-Meteo). Normalised shape: `AirData` in `packages/shared/src/air.ts`.
- The location (city label + latitude/longitude) is stored in `settings.location`
  (D1), entered in the admin UI. **It is never committed.** Only the city is needed;
  coordinates rounded to 2 decimals are sufficient (privacy).
- Cached in D1 (`provider_cache`, D-20) for the TTL (weather 15 min, air 60 min). Failure: serve the
  stale payload up to 3 h; beyond that `503` and the tile shows the error state. No location set →
  `409 location_not_set`.
- The response is validated (zod) before it is mapped; an unexpected shape counts as a provider failure.
  Normalised shape: `WeatherData` in `packages/shared/src/weather.ts` (local times of the configured zone,
  next 8 hours, today + 5 days).

## 4. Sun & Moon

Computed in the Worker with `suncalc` 2.x (BSD-2, no dependencies) from the same `settings.location`. No
network, no key, no server cache: a request takes well under a millisecond. The date is the local date in
`settings.timezone`; sun times are taken for the solar day around its local noon, the moon at that noon; the next
principal phase is found by stepping days and bisecting to under a second.

## 5. Quotes

- `content/quotes.json` bundled at build time into the Worker (import as JSON).
- Format and selection rule in doc 03. Contribution rules: short quotes only (≤ 180 characters), attribute the
  author, provide both SK and EN text (or mark one `null` → falls back to the other).
- Only authors who died more than 70 years ago (public domain in the EU); translations are our own.
- Only quotes with a known source (work, letter, speech). Popular misattributions are left out, e.g. "We are
  what we repeatedly do" (Will Durant, not Aristotle) or most internet "Mark Twain" quotes.
- `apps/worker/src/quotes/select.test.ts` checks the file (count, ids, lengths, fields).

## 6. Adding another provider later

Implement `Provider` interface in `apps/worker/src/providers/`:

```ts
interface Provider<TParams, TData> {
  name: string;                                 // for logs
  ttlSeconds: number;
  staleSeconds: number;                         // how long to serve an old payload while the provider fails
  cacheKey(params: TParams): string;            // includes a shape version, e.g. `weather:v1:…`
  fetch(params: TParams): Promise<TData>;       // normalised, provider-agnostic shape
}
```

and register a `data/<type>` route that calls `loadCached(db, provider, params)`. Credentials go through the same `accounts` table when OAuth is needed.
