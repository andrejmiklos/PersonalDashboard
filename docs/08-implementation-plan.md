# 08 — Implementation Plan

Commit style: [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
Each numbered item is one commit (or a small group). Every phase ends in a **working, demonstrable state**.
Before every commit: lint + tests + gitleaks pass; no personal data (doc 06 §4).

## Phase 0 — Bootstrap & tablet spike

Goal: repo hygiene in place and hard facts about the tablet.

1. `docs: add project documentation` — these files.
2. `chore: repo hygiene` — `.gitignore`, `LICENSE`, `.editorconfig`, `SECURITY.md`, `.dev.vars.example`, `wrangler.example.jsonc`.
3. `chore: npm workspaces skeleton` — root `package.json`, `apps/*`, `packages/shared`, TypeScript strict config, ESLint, Prettier, Vitest.
4. `chore: gitleaks pre-commit and CI` — hook + GitHub Action; enable GitHub secret scanning/push protection (manual step).
5. `feat(worker): hello worker with static assets` — Worker serving `/healthz` and `/display/`, `wrangler dev` works.
6. `feat(display): compatibility spike page` — feature-detection page (doc 02 §1).
7. **Manual:** deploy, open on the tablet, record results → `docs: record tablet compatibility results` and choose `browserslist` (item 8).
8. `chore(display): build pipeline` — Vite, `build.target: 'chrome95'` (step 7), bundle verified on the tablet.

Acceptance: spike page reachable on the tablet over HTTPS; results documented; built "hello" bundle renders on the tablet.

## Phase 1 — Backend core & auth

1. `feat(worker): D1 schema and migration runner` — migration `0001_init.sql` (doc 01 §6).
2. `feat(worker): config, env typing, error shape` — Hono app, uniform errors, security headers/CSP.
3. `feat(worker): token auth middleware` — hash lookup, roles, constant-time compare, `last_used_at` throttle.
4. `feat(scripts): token create/revoke CLI` — bootstrap first admin/device tokens.
5. `feat(worker): settings API` — locale, timezone, location, power mode.
6. `test(worker): auth and settings tests`.

Acceptance: `curl` with admin token can read/write settings; device token is limited; no token → 401.

## Phase 2 — Display runtime + first tiles (no external accounts)

1. `feat(shared): tile registry, layout types, i18n SK/EN, date helpers`.
2. `feat(worker): layouts CRUD + validator` (schema in doc 04 §1, overlap/size checks) + tests.
3. `feat(worker): display state endpoint` (fixed default layout only, ETag).
4. `feat(display): boot, token handling, state polling, stage scaling`.
5. `feat(display): layout engine (absolute % positioning)`.
6. `feat(display): clock tile`.
7. `feat(worker): weather provider + data/weather` (Open-Meteo, D1 cache, stale fallback) + mapper tests.
8. `feat(display): weather tile` (icons, states).
9. `feat(worker,display): astro tile` (suncalc).
10. `feat(worker,display): air quality & pollen tile`.
11. `feat(worker,display): quote tile` (+ initial `content/quotes.json`, ≥ 60 quotes SK/EN).
12. `feat(display): countdown tile`.
13. `feat(display): offline/stale handling and nightly reload`.

Acceptance: an admin-created layout (via API/`curl`, using `examples/*.json`) renders correctly on the tablet
with clock, weather, astro, air, quote, countdown; pulling Wi-Fi shows stale state; reconnect recovers.

## Phase 3 — Integrations: Google Calendar and Microsoft To Do

1. `feat(worker): token encryption (AES-GCM) + accounts/sources repository`.
2. `feat(worker): OAuth state/PKCE framework`.
3. `feat(worker): Google OAuth connect + calendar provider` (multi-account) + mapper tests with fictional fixtures.
4. `feat(worker): calendar data endpoint` (merge, all-day handling, cache, reauth handling).
5. `feat(display): calendar tile` (colour per calendar, all-day strip, size classes).
6. `feat(worker): Microsoft OAuth connect + To Do provider` (rotating refresh tokens safe).
7. `feat(worker): tasks data + PATCH complete/uncomplete`.
8. `feat(display): tasks tile with touch completion` (optimistic, undo chip, large touch targets).
9. `docs: provider setup walkthrough verified end-to-end` (update doc 05 with real-world gotchas, no personal data).

Acceptance: real calendars and lists appear on the tablet; completing a task on the tablet reflects in
Microsoft To Do; killing a refresh token produces a "reconnect" state, not a crash.

## Phase 4 — Admin app and layout editor

1. `feat(admin): shell, login (token), router, i18n, dark theme`.
2. `feat(admin): accounts & sources screen` (connect flows, pick calendars/lists, colours).
3. `feat(admin): layouts list` (CRUD, duplicate, import/export).
4. `feat(admin): editor canvas (grid, drag, resize, snapping, validation ghost)`.
5. `feat(admin): palette + properties forms generated from registry`.
6. `feat(admin): live preview with sample data / real data toggle`.
7. `feat(admin): undo/redo, drafts, unsaved guard, keyboard shortcuts`.
8. `feat(admin): "save & show now"` (needs override API from Phase 5 step 1; implement minimal override first if needed).
9. `test(admin): editor geometry unit tests` (collision, clamping, min sizes).

Acceptance: build a layout on the phone, save, and the tablet shows exactly it within ≤ 15 s; the layout
list persists several layouts.

## Phase 5 — Scheduling, modes, control, power

1. `feat(worker): overrides API`.
2. `feat(worker): schedule rules API + resolveState` (shared with admin) + thorough tests (midnight crossing, priority, expiry, DST days).
3. `feat(worker): rotation and touch config in state`.
4. `feat(display): rotation, touch switching, timeout revert`.
5. `feat(display): power adapter (software sleep view)`.
6. `feat(admin): schedule & modes screen with 24×7 preview`.
7. `feat(admin): control screen` (screen on/off, pin, clear override, device status).
8. `feat(display): heartbeat + device status`.

Acceptance: scheduled off window blacks out the tablet at the configured time; manual on/off from the phone
works within ≤ 15 s; rotation cycles in sync; touch swipe switches and reverts.

## Phase 6 — Polish

1. Visual design pass (typography, spacing, colour tokens) on the real tablet.
2. Performance pass on the tablet (DOM updates, timers, memory over 24 h).
3. Accessibility/contrast and SK/EN completeness check.
4. Error/empty/stale states audit for every tile.
5. `docs: screenshots` using fictional data only.

## Phase 7 — Hardening & operations

1. Rate-limit rule, CSP verification on all pages, dependency audit, Dependabot.
2. `scripts/rotate-enc-key.ts` + runbook.
3. Cron Trigger to prune expired OAuth states (and optional cache warm-up).
4. Optional GitHub Actions deploy (Cloudflare API token as Actions secret) — only if wanted.
5. Backup: `wrangler d1 export` script for layouts/settings (never commit the output).
6. Release: tag `v1.0.0`, finalise README (EN + SK), CONTRIBUTING.

## Definition of done (project)

- All FR-1…FR-12 (doc 00) demonstrated on the real tablet for ≥ 48 h without manual intervention.
- No secrets/personal data in the repository or history (gitleaks full-history scan clean).
- Docs match the implementation.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Tablet browser too old for the chosen toolchain | Phase 0 spike decides before code is written |
| TLS chain not trusted by Android 5 | Confirmed in Phase 0: ISRG Root X1 installed as user CA (doc 02 §3); re-check if Cloudflare changes CA |
| No kiosk app on Android 5 (no auto-restart, no real screen-off) | Chrome shortcut + screen pinning; reload/offline logic in `display`; software sleep view (doc 02 §3–4) |
| MS refresh-token rotation race | Serialise refresh per account; strongly consistent D1 |
| Google unverified-app warning / consent surprises | Documented one-time flow; personal use only |
| Free-tier limits | Budget in doc 01 §4 (~8 % of Worker quota) |
| Old battery swelling | Doc 02 §5 |
