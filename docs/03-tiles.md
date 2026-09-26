# 03 — Tiles

Tiles are placed on a 12×8 grid (doc 04). Each tile type declares: minimum size (cells), default size,
config schema with defaults, data source, refresh rules and behaviour in loading/empty/stale/error states.

Common tile fields (see layout schema in doc 04): `id`, `type`, `x`, `y`, `w`, `h`, `config`.

Common behaviour:

- **Size classes.** A tile renders by its *pixel box*, not its cell count: `compact` (<200 px wide or
  <120 px high), `regular`, `large`. Each tile defines what is dropped at `compact`.
- **States.** `loading` (skeleton), `ready`, `empty` (localised message), `stale` (dimmed +
  `updated hh:mm`), `error` (short message + icon; never a raw error string).
- **i18n.** All labels come from `shared/i18n` (SK/EN); locale from server settings.
- **Privacy.** Tiles never log or expose event/task text outside the DOM.

## 1. `clock` — Time & date

| Item | Value |
|---|---|
| Min / default size | 2×1 / 4×2 |
| Data source | Device clock (no API) |
| Config | `format: '24h'|'12h'` (24h), `showSeconds: bool` (false), `showDate: bool` (true), `dateStyle: 'long'|'short'` (long: "Štvrtok 24. septembra"), `showWeekNumber: bool` (false) |
| Refresh | Aligned to the second/minute using `Date.now()`; only the changed text nodes update |
| Notes | Formats in the server-configured timezone via `Intl` (doc 01 §9), so a wrong device timezone does not shift it. Sleep view reuses the same time formatting |

## 2. `calendar` — Google Calendar events

| Item | Value |
|---|---|
| Min / default size | 3×3 / 5×6 |
| Data source | Google Calendar API via server (multiple accounts) |
| Config | `sourceIds: string[]` (required, calendar sources), `daysAhead: 1–14` (3), `maxEvents: 3–30` (null = as many as fit), `showLocation: bool` (false), `showLegend: bool` (false), `hideDeclined: bool` (false), `hidePast: bool` (true). Times are 24 h in the settings time zone |
| Display | Agenda list grouped by day ("Today", "Tomorrow", weekday). Colour dot/bar **per calendar** (colour from `sources.color`). **All-day events are rendered separately** in a strip at the top of each day group (or at the top of the tile for today), not in the timed list |
| Behaviour | Events currently in progress are highlighted; past events of today are hidden (`hidePast`) or dimmed; declined events are dimmed and struck through (or hidden), tentative ones italic; multi-day all-day events appear on each day with "day 2/3"; a timed event that started earlier and still runs belongs to today ("–12:00"); an event that is in several chosen calendars is shown once, with the colour of the first calendar in `sourceIds`; days without events are left out. What does not fit the height is cut off after the last complete event |
| Refresh | Client 120 s, server cache 180 s; the list is redrawn each minute so events move to "now" and "past" |
| Normalised payload | `CalendarData` in `packages/shared/src/calendar.ts`: `sources: { id, label, color }[]` and `events: { id, sourceId, title, start, end, allDay, location?, status: 'confirmed'|'tentative'|'declined' }[]`. Timed events: ISO UTC; all-day: `YYYY-MM-DD` (end exclusive, as Google) |
| States | No `sourceIds`: "Choose calendars for this tile in the editor"; empty: "Nothing planned" / "Nič v pláne"; `409 reauth_required`: "Reconnect the account in the admin app" (shown instead of old data); failed refresh keeps the last payload, dimmed with "Updated hh:mm" |

## 3. `tasks` — Microsoft To Do

| Item | Value |
|---|---|
| Min / default size | 3×3 / 4×5 |
| Data source | Microsoft Graph To Do (personal account), multiple lists |
| Config | `sourceIds: string[]` (task lists), `maxItems: 3–40` (null = as many as fit), `showDueDate: bool` (true), `sortBy: 'due'|'created'|'list'` ('due'), `groupByList: bool` (false), `showCompleted: bool` (false) |
| Interaction | **Tap the checkbox to complete** (a 44×44 px hit area around a 24 px box; rows are at least 48 px high). The row changes at once (optimistic); when the Worker confirms, it shows "Completed" with an **Undo** chip for 5 seconds and then goes (unless `showCompleted`, which keeps completed tasks checked and reopens them on tap). If saving fails the row springs back and a note "Could not save the change." shows for 4 s; a lost account connection says "reconnect" instead. After a confirmed change the tile loads the fresh list. Long-press is *not* used |
| Display | Colour bar of the list, checkbox, title (two lines at most, `!` for high importance), due date when `showDueDate`: "Today" in the accent colour, "Tomorrow", the short date, "Overdue · date" in red. `sortBy` orders by due date (tasks without one last), creation, or list; `groupByList` adds a header per list. What does not fit the height is cut off after the last complete row |
| Refresh | Client 60 s, server cache 60 s; invalidated after a successful PATCH |
| Payload | `TaskData` in `packages/shared/src/tasks.ts`: `sources: { id, label, color }[]` and `tasks: { id, sourceId, title, due?: 'YYYY-MM-DD', importance: 'low'|'normal'|'high', completed: bool, createdAt }[]` (`sourceId` is our `src_…` id of the list) |
| Write API | `PATCH /api/v1/tasks/:sourceId/:taskId` — allowed for the `device` role, only for enabled task lists (see doc 06) |
| States | No `sourceIds`: "Choose task lists for this tile in the editor"; empty: "All done" / "Všetko hotové"; `409 reauth_required`: "Reconnect the account in the admin app"; failed refresh keeps the last list, dimmed with "Updated hh:mm" |

The tile must never offer create/edit/delete — only complete/uncomplete.

## 4. `quote` — Quote of the day

| Item | Value |
|---|---|
| Min / default size | 3×2 / 6×2 |
| Data source | `content/quotes.json` bundled into the Worker |
| Config | `language: 'auto'|'sk'|'en'` (auto = UI locale), `showAuthor: bool` (true) |
| Selection | Deterministic per local date (settings time zone): Fisher–Yates order from a fixed seed (mulberry32), `quote = order[dayNumber mod N]`, so no repeats until the list is exhausted; changes at local midnight |
| Content file | `[{ "id": "q001", "sk": "…", "en": "…", "author": "…", "authorSk"?: "…" }]` — `authorSk` when the Slovak name differs (Konfucius); a `null` text falls back to the other language, the author name follows the requested one. Only public-domain / clearly attributable short quotes (≤ 180 characters); rules in doc 05 §5 |
| Display | Quote in language-specific marks („…“ / “…”), italic, centred; author right-aligned below |
| Refresh | Fetched once and again just after local midnight |
| Text fitting | Largest font size that fits the box (binary search, 7 steps, 0.75–3 rem); runs only when the quote or the box changes |

## 5. `weather` — Weather (Open-Meteo)

| Item | Value |
|---|---|
| Min / default size | 3×2 / 4×4 |
| Data source | Open-Meteo Forecast API (`api.open-meteo.com`), lat/lon from server setting `location` |
| Config | `showHourly: bool` (true, next 8 hours), `dailyDays: 0–5` (3), `showFeelsLike: bool` (true), `showPrecipitation: bool` (true), `showWind: bool` (true: wind in line 2 and a wind row in the hourly strip), `showLocation: bool` (true, the name of the place beside the temperature) |
| Display | Top row: weather icon and temperature, large and side by side, the name of the place (`settings.location.label`) larger and right-aligned beside them. Line 1: condition · feels like · minimum / maximum of today. Line 2: precipitation probability · wind (left out when both are switched off). Then the hourly strip (hour, icon, temperature, precipitation probability and a row with the wind in km/h, numbers only), then the daily rows from tomorrow: one block centred in the tile with columns of fixed width (weekday, icon, precipitation, min, max) |
| Sizing | Text scales with the box (0.9×–1.75×); what does not fit is dropped instead of shrinking further, from the bottom: the daily rows first, then the wind row of the hourly strip, then the strip itself (daily rows never take the place of a strip that did not fit), then hours from the right. In the default 4×4 tile: 6 hours with wind and 2 days. `compact`: icon + temperature only |
| Icons | Own line SVGs (`packages/tiles/src/tiles/weather-icons.ts`) mapped from WMO codes; clear and partly cloudy have night variants; colours from CSS |
| States | Loading text; missing location → "set a location in admin"; provider down without data → error; failed refresh keeps the last payload and marks it stale (dimmed + "Updated hh:mm") when the server says `stale` or it is older than 2 × TTL |
| Refresh | 15 min; after a failure retry after 1 min, doubling up to 15 min |
| Attribution | Small "Weather data by Open-Meteo.com" text (CC BY 4.0). Shown in the tile footer at `regular`+ size, or once in the admin About page if the tile is `compact` |
| Units | Metric (°C, km/h, mm) |

## 6. `astro` — Sun & Moon

| Item | Value |
|---|---|
| Min / default size | 2×2 / 3×2 |
| Data source | Computed on the Worker with `suncalc` (BSD-2) for the configured location and date; no external API |
| Config | `showDayLength: bool` (true), `showMoonIllumination: bool` (true), `showNextPhase: bool` (false) |
| Display | Sun arc (SVG) with the sun at the current share of daylight (on the horizon, dimmed, at night), sunrise / sunset times, day length; moon disk drawn from `phase` (northern-hemisphere view), phase name, illumination %, optional next principal phase with date. Polar day / night: "The sun does not set / rise" |
| Sizing | Sun and moon side by side; stacked when the tile is narrower than 1.3 × its height; text scales 0.8×–2× |
| Refresh | Client polls every 6 h and just after local midnight; the sun moves along the arc every 5 min |
| Payload | `AstroData` in `packages/shared/src/astro.ts`: `{ date, sunrise, sunset, dayLengthMin, moon: { phase: 0..1, illumination: 0..1, name }, nextPhase: { name, date } }`; `sunrise`/`sunset` are UTC instants or `null` (polar day: `dayLengthMin` 1440, polar night: 0); `name` is one of 8 phases, each covering an eighth of the cycle |

## 7. `air` — Air quality (Open-Meteo, CAMS)

| Item | Value |
|---|---|
| Min / default size | 2×1 / 2×2 |
| Data source | Open-Meteo Air Quality API (`air-quality-api.open-meteo.com`, CAMS models): current `european_aqi`, `pm2_5`, `pm10` |
| Config | `showParticles: bool` (true) |
| Display | European AQI value, band label in the band colour, a six-band scale (EEA colours, 0–120) with a marker, "European air quality index" caption, PM2.5 / PM10 in µg/m³. `compact`: value + band only |
| Bands | Open-Meteo / EEA: 0–20 good, 20–40 fair, 40–60 moderate, 60–80 poor, 80–100 very poor, above 100 extremely poor |
| States | As weather: loading, location not set, error, stale |
| Refresh | 60 min; retry after 1 min on failure, doubling |
| Attribution | "Air quality: CAMS, Open-Meteo.com" in the footer at `regular`+ size — Open-Meteo requires crediting the CAMS ENSEMBLE data provider and Open-Meteo |
| Pollen | Not shown (owner decision, D-09); see backlog |

## 8. `countdown` — Countdown to an event

| Item | Value |
|---|---|
| Min / default size | 2×1 / 3×2 |
| Data source | None (config only) |
| Config | `label: string` (required, ≤ 40 chars), `target: 'YYYY-MM-DD'` or `'YYYY-MM-DDTHH:mm'` (local), `showTime: bool` (false: days only), `afterBehaviour: 'hide'|'zero'|'since'` ('zero') |
| Display | Large number of calendar days with unit (SK plurals: deň / dni / dní), label below in the accent colour; "Today!" for the whole day of a date-only target, until the time of a target with a time. `showTime`: `1 d 19 h 8 min` (or `2 h 35 min` on the last day) |
| After the event | `hide`: empty tile; `zero`: "0 days"; `since`: "5 days since" (with `showTime` and a time: the duration since) |
| Time zone | Days and the target are in the settings time zone, not the device one; a target with a time stays at that local time across DST changes (`zonedTimeToInstant`) |
| Refresh | Recomputed each minute (aligned to the minute) from the device clock; no API |
| Calendar source (Phase 3, D-21) | Config gains `source: 'manual' \| 'calendar'` (default `manual`, the fields above). For `calendar` the keys are `source`, `sourceIds` (calendars, required), `maxEvents` (1–10, null = as many as fit) and `showTime`; `label`, `target` and `afterBehaviour` are not accepted (the validator picks the key set by `source`, `configDefaultsFor` in the registry). Shows the nearest events of those calendars that have not started: the first one large (days, "Today!" for an event of today, or the time left with `showTime`) with its title in the accent colour, the next ones as a list "title · N days" cut off after the last complete row. Declined events are skipped. Data: `GET /data/calendar?days=365&limit=maxEvents+4` (doc 07), polled every 5 min, the list is recomputed each minute; events that start drop off, so `afterBehaviour` applies to the manual source only. Empty: "Nothing planned"; no calendars chosen and `409 reauth_required` as in the calendar tile |

## 9. Tile registry (in `packages/shared`)

Each type exports metadata used by editor and validator:

```ts
interface TileTypeMeta {
  type: TileType;
  minW: number; minH: number;
  defaultW: number; defaultH: number;
  configDefaults: Record<string, unknown>;
  fields: FieldDef[];               // one per setting: boolean, enum, integer (nullable = automatic), text, datetime, sources
  needsSources?: 'calendar' | 'task_list';
}
```

The registry is the single source of truth for: editor palette, size clamping, config defaults and
server-side layout validation.

## 10. Adding a new tile type (checklist)

1. Add metadata to the shared registry and i18n keys (SK+EN).
2. Add server provider + `GET /api/v1/data/<type>` (if it needs data) with TTL.
3. Add the tile module to `packages/tiles` (Chrome 95-safe). The admin form is generated from `fields`; add the
   labels `field.<type>.<key>` (and `option.<key>.<value>` for enums) to the i18n dictionaries (a test checks
   that none is missing) and the same limits to the zod schema (a test in the Worker compares the two).
4. Add doc section here, a sample in `examples/`, and tests (validator + provider mapper).
