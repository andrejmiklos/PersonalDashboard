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
| Notes | Uses device timezone (must match server setting). Sleep view reuses the same time formatting |

## 2. `calendar` — Google Calendar events

| Item | Value |
|---|---|
| Min / default size | 3×3 / 5×6 |
| Data source | Google Calendar API via server (multiple accounts) |
| Config | `sourceIds: string[]` (required, calendar sources), `daysAhead: 1–14` (3), `maxEvents: 3–30` (auto by height), `showLocation: bool` (false), `showLegend: bool` (false), `hideDeclined: bool` (false), `timeFormat` inherits from clock setting |
| Display | Agenda list grouped by day ("Today", "Tomorrow", weekday). Colour dot/bar **per calendar** (colour from `sources.color`). **All-day events are rendered separately** in a strip at the top of each day group (or at the top of the tile for today), not in the timed list |
| Behaviour | Events currently in progress are highlighted; past events of today are dimmed or hidden (`hidePast` default true); multi-day all-day events show "day 2/3" |
| Refresh | Client 120 s, server cache 180 s |
| Normalised payload | `{ id, sourceId, title, start, end, allDay, location?, status: 'confirmed'|'tentative'|'declined' }`. Timed events: ISO UTC; all-day: `YYYY-MM-DD` (end exclusive, as Google) |
| Empty state | "Nothing planned" / "Nič v pláne" |

## 3. `tasks` — Microsoft To Do

| Item | Value |
|---|---|
| Min / default size | 3×3 / 4×5 |
| Data source | Microsoft Graph To Do (personal account), multiple lists |
| Config | `sourceIds: string[]` (task lists), `maxItems: 3–40` (auto by height), `showDueDate: bool` (true), `sortBy: 'due'|'created'|'list'` ('due'), `groupByList: bool` (false), `showCompleted: bool` (false) |
| Interaction | **Tap the checkbox to complete** (44×44 px touch target minimum). Optimistic update; after success the item fades out (if `showCompleted=false`). Long-press is *not* used. Undo: a 5-second inline "Undo" chip after completing |
| Display | Title, list colour dot, due date ("today"/"overdue" emphasised) when `showDueDate` |
| Refresh | Client 60 s, server cache 60 s; invalidated after a successful PATCH |
| Payload | `{ id, listId, title, due?: 'YYYY-MM-DD', importance: 'low'|'normal'|'high', completed: bool, createdAt }` |
| Write API | `PATCH /api/v1/tasks/:listId/:taskId` — allowed for the `device` role (see doc 06) |
| Empty state | "All done" / "Všetko hotové" |

The tile must never offer create/edit/delete — only complete/uncomplete.

## 4. `quote` — Quote of the day

| Item | Value |
|---|---|
| Min / default size | 3×2 / 6×2 |
| Data source | `content/quotes.json` bundled into the Worker |
| Config | `language: 'auto'|'sk'|'en'` (auto = UI locale), `showAuthor: bool` (true) |
| Selection | Deterministic per local date: shuffled order by a fixed seed, `index = dayNumber mod N` after a permutation, so no repeats until the list is exhausted; changes at local midnight |
| Content file | `[{ "id": "q001", "sk": "…", "en": "…", "author": "…" }]` — only public-domain / clearly attributable short quotes; no copyrighted long text |
| Refresh | Fetched once and again after midnight |
| Text fitting | Font size auto-shrinks (binary search in `resize`) to fit the box; max 3 attempts on resize only |

## 5. `weather` — Weather (Open-Meteo)

| Item | Value |
|---|---|
| Min / default size | 3×2 / 4×4 |
| Data source | Open-Meteo Forecast API (`api.open-meteo.com`), lat/lon from server setting `location` |
| Config | `showHourly: bool` (true, next 8 hours), `dailyDays: 0–5` (3), `showFeelsLike: bool` (true), `showPrecipitation: bool` (true), `showWind: bool` (false) |
| Display | Current temperature + icon + condition text; min/max today; optional hourly strip (temp + precip probability); daily rows |
| Icons | Bundled SVG mapped from WMO weather codes (day/night variants) |
| Refresh | 15 min |
| Attribution | Small "Weather data by Open-Meteo.com" text (CC BY 4.0). Shown in the tile footer at `regular`+ size, or once in the admin About page if the tile is `compact` |
| Units | Metric (°C, km/h, mm) |

## 6. `astro` — Sun & Moon

| Item | Value |
|---|---|
| Min / default size | 2×2 / 3×2 |
| Data source | Computed on the Worker with `suncalc` (BSD-2) for the configured location and date; no external API |
| Config | `showDayLength: bool` (true), `showMoonIllumination: bool` (true), `showNextPhase: bool` (false) |
| Display | Sunrise / sunset times, day length, sun progress arc (SVG), moon phase icon + name + illumination % |
| Refresh | Computed per date; client polls every 6 h and at midnight |
| Payload | `{ date, sunrise, sunset, dayLengthMin, moon: { phase: 0..1, illumination: 0..1, name } }` |

## 7. `air` — Air quality & pollen (Open-Meteo)

| Item | Value |
|---|---|
| Min / default size | 3×2 / 3×3 |
| Data source | Open-Meteo Air Quality API (`air-quality-api.open-meteo.com`): `european_aqi`, `pm2_5`, `pm10`, pollen fields (alder, birch, grass, mugwort, ragweed, olive) |
| Config | `showPollen: bool` (true), `pollenTypes: string[]` (birch, grass, ragweed, mugwort, alder), `showParticles: bool` (false) |
| Display | AQI value + band label (Good … Extremely poor) with colour band; pollen rows with level bars |
| Behaviour | Pollen values are `null` outside the season/coverage → show "not in season / mimo sezóny", never 0 |
| Refresh | 60 min |
| Attribution | Same as weather |

## 8. `countdown` — Countdown to an event

| Item | Value |
|---|---|
| Min / default size | 2×1 / 3×2 |
| Data source | None (config only) |
| Config | `label: string` (required, ≤ 40 chars), `target: 'YYYY-MM-DD'` or `'YYYY-MM-DDTHH:mm'` (local), `showTime: bool` (false: days only), `afterBehaviour: 'hide'|'zero'|'since'` ('zero') |
| Display | Large number of days (or `d h m`), label below; "Today!" on the day |
| Refresh | Recomputed each minute from the device clock |

## 9. Tile registry (in `packages/shared`)

Each type exports metadata used by editor and validator:

```ts
interface TileTypeMeta {
  type: TileType;
  minW: number; minH: number;
  defaultW: number; defaultH: number;
  configDefaults: Record<string, unknown>;
  needsSources?: 'calendar' | 'task_list';
}
```

The registry is the single source of truth for: editor palette, size clamping, config defaults and
server-side layout validation.

## 10. Adding a new tile type (checklist)

1. Add metadata to the shared registry and i18n keys (SK+EN).
2. Add server provider + `GET /api/v1/data/<type>` (if it needs data) with TTL.
3. Add display module (ES5-safe) and admin config form.
4. Add doc section here, a sample in `examples/`, and tests (validator + provider mapper).
