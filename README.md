# Personal Dashboard

A self-hosted wall dashboard for an old Android tablet (Samsung Galaxy Tab 4 10.1, Android 5.0.2) running in kiosk mode.
Pick tiles, arrange them in a web editor, save layouts, and let the tablet show exactly the one you choose.

> Slovak version: [README.sk.md](README.sk.md)

**Status:** Phases 0–3 done (backend core, display runtime, first tiles, offline handling, Google Calendar); the Google
calendar and the countdown are verified on the real tablet. Microsoft To Do is implemented but not connected yet, an
optional item in the [backlog](docs/09-backlog.md). Phase 4 (admin app and layout editor) is implemented and tested against
a local Worker; deploying it and trying it on the real phone and tablet is the remaining step. See
[docs/08-implementation-plan.md](docs/08-implementation-plan.md).

## Working now

- Worker on Cloudflare Workers + D1: token auth (admin / device), settings, layouts API with validation
- Tablet display: pairing with a one-time code, state polling, layout rendering, screen wake lock
- Tiles: clock & date, weather (Open-Meteo, with the name of your place, hourly strip with wind, cached on the Worker, stale fallback), sun & moon (suncalc), air quality, quote of the day (70 public-domain quotes, SK + EN), countdown
- Google Calendar (several accounts) connected by OAuth and verified on the tablet: calendar tile (colour per calendar, all-day strip, an event in two calendars shown once) and a countdown to the nearest calendar events
- Tokens and cached events/tasks are sealed in D1 with AES-GCM; accounts, calendars and lists are chosen with `npm run accounts`
- Microsoft To Do connection and the tasks tile (tap to complete, undo) are implemented and tested, but not connected to a real account (optional, see the backlog)
- Slovak and English UI, dark theme, landscape fullscreen kiosk
- Offline resilience: last layout and tile data from `localStorage`, stale indicators, offline badge, nightly
  reload only when the server answers
- Hardening: per-IP rate limits, strict Content-Security-Policy, gitleaks (pre-commit + CI), `npm audit` in CI,
  Dependabot, GitHub Actions pinned to commit SHAs
- CLI scripts: tokens, pairing codes, layout import, settings (location, locale, time zone), smoke test
- Admin app at `/admin/` (implemented, tested locally, not yet checked on the real devices): sign in with the admin token, connect accounts and choose calendars and lists, manage layouts (create, duplicate, rename, default, import/export), edit a layout on a 12×8 grid with a live preview of the real tiles (drag, resize, steppers for the phone, undo/redo, drafts, keyboard), *Save and show now* pins a layout on the tablet, minimal settings (language, time zone, location)
- Runs on the Cloudflare Workers + D1 free tier; no server at home

## Planned

- Layout switching: manual, scheduled, rotation, touch on the tablet (Phase 5)
- Display power: always on, scheduled, manual on/off (Phase 5)

## Architecture in one picture

```
Tablet (Chrome 95 kiosk) ──▶ Cloudflare Worker (API + static apps + D1) ──▶ Google / Microsoft / Open-Meteo
Phone/PC (admin editor)       ──▶ (same Worker, admin token)
```

## Getting started

Prerequisites, first deployment, pairing the tablet, settings, layouts and troubleshooting are in the
[operations runbook](docs/10-operations.md). The tablet itself is prepared as described in
[docs/02-tablet-and-kiosk.md](docs/02-tablet-and-kiosk.md) §3.

What the app does with your calendar and task data: [PRIVACY.md](PRIVACY.md).

## Documentation

Start with [docs/00-overview.md](docs/00-overview.md).

| Doc | Topic |
|---|---|
| [00 Overview](docs/00-overview.md) | Goals, requirements, decision log |
| [01 Architecture](docs/01-architecture.md) | Components, data flow, DB schema |
| [02 Tablet & kiosk](docs/02-tablet-and-kiosk.md) | Android 5 constraints, Chrome kiosk, power |
| [03 Tiles](docs/03-tiles.md) | Tile catalogue and configs |
| [04 Layouts & editor](docs/04-layouts-and-editor.md) | Layout model, editor, schedule |
| [05 Integrations](docs/05-integrations.md) | Google, Microsoft, Open-Meteo setup |
| [06 Security & public repo](docs/06-security-and-public-repo.md) | Tokens, secrets, hygiene |
| [07 API](docs/07-api.md) | HTTP API reference |
| [08 Implementation plan](docs/08-implementation-plan.md) | Phases and commits |
| [09 Backlog](docs/09-backlog.md) | Ideas out of scope |
| [10 Operations](docs/10-operations.md) | Runbook: deploy, pairing, settings, troubleshooting |

## Security note

This repository is public. It contains no secrets, no personal data and no real hostnames. Configuration is
supplied through Cloudflare secrets and git-ignored local files (`.dev.vars`, `wrangler.jsonc`). Read
[docs/06-security-and-public-repo.md](docs/06-security-and-public-repo.md) before contributing.

Weather and air-quality data by [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0); air quality from the
Copernicus Atmosphere Monitoring Service (CAMS).

## License

[MIT](LICENSE)
