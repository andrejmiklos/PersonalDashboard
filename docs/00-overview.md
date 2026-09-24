# 00 — Overview & Decisions

## 1. Goal

A personal, always-on wall dashboard shown on a fixed tablet (kiosk). The owner picks tiles,
sizes and positions them in a web editor, saves the result as a named **layout**, and the tablet
then shows exactly that layout. Several layouts can be stored and switched manually, by schedule,
by rotation, or by touch on the tablet.

Non-goals: multi-user / multi-tenant SaaS, native Android app, commercial use.

## 2. Target hardware

| Item | Value |
|---|---|
| Device | Samsung Galaxy Tab 4 10.1 (SM-T530), Wi-Fi |
| OS | Android 5.0.2 (Lollipop) |
| Display | 10.1", 1280×800, landscape, LCD (no OLED burn-in) |
| Mounting | Fixed, permanently powered, Wi-Fi |
| Browser | Google Chrome, last release available for Android 5 (version measured in Phase 0) |

See [02-tablet-and-kiosk.md](02-tablet-and-kiosk.md) for the compatibility rules this imposes.

## 3. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Tiles: clock & date, calendar events, tasks, quote of the day, weather, sun & moon, air quality & pollen, countdown |
| FR-2 | Calendar tile reads **multiple Google accounts / calendars**, colour per calendar, all-day events shown separately |
| FR-3 | Tasks tile reads **Microsoft To Do** (personal account, multiple lists) and lets the user **complete/uncomplete tasks by touch** |
| FR-4 | Quote of the day from a curated list stored in the repo (SK + EN) |
| FR-5 | Weather from Open-Meteo (no API key) |
| FR-6 | Web editor (phone/PC): pick tiles, drag/resize on a grid, configure each tile, live preview at tablet aspect ratio |
| FR-7 | Layouts are saved into a list; selecting one makes the tablet show exactly that saved layout |
| FR-8 | Layout selection: manual pick, time/day schedule, automatic rotation, touch switch on the tablet |
| FR-9 | Display power modes: **always-on**, **scheduled** (e.g. 06:30–23:00), **manual on/off** from phone/web |
| FR-10 | UI languages: Slovak and English |
| FR-11 | Dark theme, landscape orientation |
| FR-12 | Tablet keeps working (shows last known data, marked stale) when Wi-Fi/backend is temporarily unavailable |

## 4. Non-functional requirements

- **Public repository:** no secret, token, personal identifier, real layout, real event or location may ever be committed. See [06-security-and-public-repo.md](06-security-and-public-repo.md).
- **Cost:** everything free.
- **Old browser:** display app targets Chrome 95, the last release for Android 5 (measured in Phase 0).
- **Performance:** weak CPU / ~1.5 GB RAM: no heavy blur/shadows, minimal DOM churn, no continuous animations.
- **Maintainability:** small dependency-light codebase; TypeScript everywhere; one owner.
- **Licence:** MIT.

## 5. Decision log

All decisions below were made with the owner during requirements gathering (2026-09).

| # | Topic | Decision | Notes |
|---|---|---|---|
| D-01 | Backend hosting | **Cloudflare Workers + D1** (serverless, free tier) | Owner has no always-on home device |
| D-02 | Kiosk runtime | **Chrome** home-screen shortcut (fullscreen manifest) + Android screen pinning | Fully Kiosk requires Android 6+ (not offered for the tablet); software sleep only, see doc 02 |
| D-03 | Layout editing | Web editor in phone/PC browser | Tablet only displays (plus limited touch) |
| D-04 | Google Calendar | **OAuth**, OAuth consent screen set to *In production* (unverified app) | Avoids 7-day refresh-token expiry of *Testing* mode |
| D-05 | Google accounts | **Multiple** Google accounts | Token + sources per account |
| D-06 | Microsoft To Do | Personal MS account, **multiple lists**, read + complete | Graph `Tasks.ReadWrite` |
| D-07 | Weather | Open-Meteo | Attribution required (CC BY 4.0) |
| D-08 | Quote of the day | Own JSON list in repo, SK + EN | Deterministic per date |
| D-09 | Extra tiles | Sun & moon, air quality & pollen, countdown | Nothing else selected (see backlog) |
| D-10 | Layout switching | Manual, schedule, rotation, touch | Precedence in doc 04 |
| D-11 | Power control | Scheduled + manual (+ always-on) | Light sensor / motion not selected |
| D-12 | Look | Landscape, dark | |
| D-13 | Access control | **Two bearer tokens**: `admin` and `device` | Device token: read + complete tasks + heartbeat only |
| D-14 | Calendar display | Colour per calendar; all-day events in a separate strip | |
| D-15 | Location | Bratislava, stored in DB settings, **not** in repo | |
| D-16 | Languages | UI SK+EN; docs EN + Slovak README; code/comments EN | |
| D-17 | Licence | MIT | |
| D-18 | Storage | D1 (SQLite) rather than KV | Strong consistency for rotating refresh tokens; SQL-friendly |
| D-19 | Layout engine | Absolute positioning in %, 12×8 grid | Chosen before Phase 0; kept because it maps 1:1 to editor coordinates |

## 6. Accounts & external prerequisites (owner action)

1. Cloudflare account (free).
2. Google Cloud project with Calendar API + OAuth client (doc 05).
3. Microsoft Entra app registration (personal accounts) (doc 05).
4. GitHub repo settings: secret scanning + push protection (doc 06).
5. Tablet: update Chrome via Play Store, check its version, set up the kiosk shortcut (doc 02).

## 7. Document index

| File | Content |
|---|---|
| [01-architecture.md](01-architecture.md) | Components, data flow, D1 schema, repo layout, tech stack |
| [02-tablet-and-kiosk.md](02-tablet-and-kiosk.md) | Android 5 constraints, Chrome kiosk setup, power/sleep |
| [03-tiles.md](03-tiles.md) | Tile catalogue, config schemas, refresh rules |
| [04-layouts-and-editor.md](04-layouts-and-editor.md) | Layout model, editor, schedule, precedence |
| [05-integrations.md](05-integrations.md) | Google, Microsoft, Open-Meteo, quotes setup |
| [06-security-and-public-repo.md](06-security-and-public-repo.md) | Threat model, secrets, public-repo hygiene |
| [07-api.md](07-api.md) | HTTP API reference |
| [08-implementation-plan.md](08-implementation-plan.md) | Phases, commits, acceptance criteria |
| [09-backlog.md](09-backlog.md) | Ideas not in scope |
