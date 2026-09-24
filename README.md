# Personal Dashboard

A self-hosted wall dashboard for an old Android tablet (Samsung Galaxy Tab 4 10.1, Android 5.0.2) running in kiosk mode.
Pick tiles, arrange them in a web editor, save layouts, and let the tablet show exactly the one you choose.

> Slovak version: [README.sk.md](README.sk.md)

**Status:** Phases 0–2 done (backend core, display runtime, first tiles, offline handling); next is Phase 3
(Google Calendar and Microsoft To Do). See [docs/08-implementation-plan.md](docs/08-implementation-plan.md).

## Working now

- Worker on Cloudflare Workers + D1: token auth (admin / device), settings, layouts API with validation
- Tablet display: pairing with a one-time code, state polling, layout rendering
- Tiles: clock, weather (Open-Meteo, cached on the Worker, stale fallback), sun & moon (suncalc), air quality, quote of the day (70 public-domain quotes, SK + EN), countdown
- Offline resilience: last layout and tile data from `localStorage`, stale indicators, offline badge, nightly
  reload only when the server answers
- CLI scripts: tokens, pairing codes, layout import, settings (location, locale, time zone), smoke test

## Features (planned)

- Tiles: clock & date, Google Calendar events (multiple accounts), Microsoft To Do tasks (tap to complete),
  quote of the day, weather, sun & moon, air quality, countdown
- Drag & drop layout editor (phone/PC), multiple saved layouts
- Layout switching: manual, scheduled, rotation, touch on the tablet
- Display power: always on, scheduled, manual on/off
- Slovak and English UI, dark theme, landscape
- Runs on Cloudflare Workers + D1 free tier; no server at home

## Architecture in one picture

```
Tablet (Chrome 95 kiosk) ──▶ Cloudflare Worker (API + static apps + D1) ──▶ Google / Microsoft / Open-Meteo
Phone/PC (admin editor)       ──▶ (same Worker, admin token)
```

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

## Security note

This repository is public. It contains no secrets, no personal data and no real hostnames. Configuration is
supplied through Cloudflare secrets and git-ignored local files (`.dev.vars`, `wrangler.jsonc`). Read
[docs/06-security-and-public-repo.md](docs/06-security-and-public-repo.md) before contributing.

Weather and air-quality data by [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0); air quality from the
Copernicus Atmosphere Monitoring Service (CAMS).

## License

[MIT](LICENSE)
