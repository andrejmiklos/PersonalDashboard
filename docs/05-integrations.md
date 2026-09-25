# 05 — Integrations

All provider credentials live in Cloudflare secrets / D1 (encrypted) — never in the repo. Placeholders like
`<worker-host>` stand for the owner's own Worker hostname, which is intentionally not committed.

## 1. Google Calendar (OAuth 2.0, multiple accounts)

### 1.1 One-time setup (Google Cloud Console)

1. Create a project (e.g. `personal-dashboard`).
2. **APIs & Services → Library → Google Calendar API → Enable.**
3. **OAuth consent screen**: User type *External*. App name, support email (owner's).
   Scopes to add:
   - `openid` (only the stable subject id of the account; no e-mail or profile scope)
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
   row (random `state` stored as its SHA-256, PKCE `verifier`, 10 min TTL; expired rows are dropped on the
   next start) → returns Google auth URL (`access_type=offline`, `prompt=consent`, scopes above,
   `code_challenge`). The redirect URI is the Worker's own origin + `/oauth/google/callback`.
2. Browser navigates to Google → user consents → redirect to `/oauth/google/callback?code&state`.
3. Callback (no bearer; authenticated by the single-use `state`): exchange code (+ verifier), read the
   subject id (`sub` of the ID token, which comes straight from Google's token endpoint, so its signature is
   not checked), label the account with the id of its primary calendar (its e-mail address; only shown in
   admin, and skipped if that request fails), encrypt the refresh token (AES-GCM, key = `TOKEN_ENC_KEY`
   secret), upsert `accounts`. Reconnecting the same account replaces its token in place.
4. Redirect (`303`) to `/admin/#/accounts?connected=google`, or `?error=denied|invalid_state|failed` (a
   fragment, so it never reaches a server), where the user selects which calendars to enable and assigns
   colours. The state is consumed by the same statement that reads it, so a callback works once. The admin
   app arrives in Phase 4; until then the redirect lands on a missing page and the result is checked with
   `GET /api/v1/accounts`.

Repeat for each Google account.

### 1.3 Data access

- Access token: cached sealed in `accounts` until 60 s before `expires_in`; refreshed from the stored refresh
  token under a per-account lock (D-22). Calendar and task payloads are cached sealed in `personal_cache`
  (the Cache API does not reliably persist on `*.workers.dev`, D-20; plain D1 would leave event content readable).
- `GET calendarList` → sources discovery (admin only, live on every call, not cached).
- Events: `GET /calendar/v3/calendars/{id}/events` with `singleEvents=true`, `orderBy=startTime`,
  `timeMin`, `timeMax`, `maxResults=250`, `fields` limited to id/summary/start/end/location/status/attendees(self,responseStatus).
  One request per enabled calendar, in parallel, merged & sorted server-side; each calendar is cached on its own
  (180 s fresh, served stale for up to 6 h while Google fails).
- Colour: from `sources.color` (owner-chosen), not Google's.
- Errors: `invalid_grant` → `accounts.status = 'reauth_required'` and `409 reauth_required` from then on, even
  while a cache would still answer; other failures (403/429/5xx) → serve the sealed stale copy, else `503`.

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

Same as Google (state + PKCE, admin-initiated, encrypted refresh token), on the `consumers` authority with
`prompt=select_account` so the owner can pick the account when several are signed in. The account is identified
by `GET /me` (object id as `external_id`, the mail address as label), which is why `User.Read` is requested.
Microsoft **rotates refresh tokens** on use — the new token is written to D1 (sealed) before the refresh lock is
released. Refreshes of one account are serialised by a lock column on `accounts` (`refresh_lock_until`, taken
with one conditional `UPDATE`, expires by itself after 15 s); a request that loses the lock waits up to 5 s for
the winner's access token instead of spending the same refresh token again. This is why D1 (strong consistency)
is used instead of KV. `invalid_grant` marks the account `reauth_required`.

### 2.3 Data access

- Lists: `GET /v1.0/me/todo/lists` → sources of kind `task_list` (admin picks which to show).
- Tasks: `GET /v1.0/me/todo/lists/{id}/tasks?$filter=status ne 'completed'&$orderby=…&$top=100`
  (`$orderby` support is limited — sort on the server after fetch).
- Discovery lists `GET /v1.0/me/todo/lists?$top=100` (first page only).
- Complete: `PATCH /v1.0/me/todo/lists/{listId}/tasks/{taskId}` with `{ "status": "completed" }`;
  uncomplete: `{ "status": "notStarted" }`.
- Only these two mutations are exposed by our API.
- Recurring tasks: completing one creates the next instance in To Do itself; the next poll picks it up.
- Errors: 401 → refresh; `invalid_grant` → `reauth_required`; 429 → honour `Retry-After`, serve stale.

## 3. Open-Meteo (weather, air quality)

- No API key; free for non-commercial use; **attribution required** (CC BY 4.0) — see tile docs.
- Forecast: `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,precipitation&hourly=temperature_2m,precipitation_probability,weather_code,is_day,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=<tz>&forecast_days=6`
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

## 6. Order of the setup

1. Google Cloud and Microsoft Entra setup (§1.1, §2.1), with the redirect URIs of your Worker host.
2. `wrangler secret put` for the five secrets, then migrate and deploy (doc 10 §4.1).
3. `npm run accounts -- … --connect google` (and `microsoft`): open the printed address, sign in, allow.
4. `--discover` and `--add` the calendars and lists to show; give each a colour (doc 10 §4.2).
5. Put the source ids into the tiles of your layout and import it.

Confirmed on the owner's setup (Google):

- The OAuth client type is **Web application** (the flow runs on the Worker), with the redirect URI of the Worker
  and no JavaScript origins.
- Switching the consent screen to *In production* requires an application home page and a privacy policy URL, and
  Google checks that their domain is registered to the owner. `github.com` is not accepted. A GitHub Pages user
  site (`<user>.github.io`, its own repository) with the Search Console HTML-file verification was set up for
  this (`PRIVACY.md` is the policy text); Cloud Console still did not accept the domain, so the app stays in
  *Testing*: add the Google accounts as test users and reconnect them every 7 days.
- The calendar and countdown tiles worked on the real tablet with two calendars; an event that is in two chosen
  calendars was shown twice until the server de-duplicated it.

What the providers document, not yet confirmed on the owner's own accounts (Microsoft To Do not yet connected):

- Google shows "Google hasn't verified this app" once per account for an unverified production app: *Advanced →
  Go to <app> (unsafe)*.
- A Google OAuth client in *Testing* status issues refresh tokens that expire after 7 days; publish it (§1.1).
- Both providers compare the redirect URI character by character, including `https` and the missing trailing slash.
- Microsoft client secrets expire (at most 24 months): note the date, create a new secret before it, `wrangler
  secret put MS_CLIENT_SECRET`, then delete the old one.
- A Microsoft refresh token that was not used for 90 days stops working; the account then needs to be connected again.

## 7. Adding another provider later

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
