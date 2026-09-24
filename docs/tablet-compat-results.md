# Tablet compatibility results (Phase 0)

Measured 2026-09-24 with `/display/spike.html` on the target tablet (doc 02 §1). No personal data.

## Environment

| Item | Value |
|---|---|
| Device / OS | Samsung Galaxy Tab 4 10.1 (SM-T530), Android 5.0.2 |
| Browser | Google Chrome **95.0.4638.74** (latest offered by Play Store for Android 5) |
| User agent | `Mozilla/5.0 (Linux; Android 5.0.2; SM-T530) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.74 Safari/537.36` |
| Screen | 1280×800 @ dpr 1; viewport 1280×800 from the fullscreen shortcut (1280×679 in a normal tab) |
| JS heap (used / limit) | 10 MB / 368 MB |

## TLS

| Check | Result |
|---|---|
| `https://…workers.dev` out of the box | **Fails**: certificate chains to ISRG Root X1 (Let's Encrypt), not in the Android 5 trust store. Chrome silently fell back to `http://` for the typed host |
| After installing ISRG Root X1 as a user CA (doc 02 §3 step 0) | **OK**, page served over `https:` |

## Kiosk

| Check | Result |
|---|---|
| Home-screen shortcut with `display: fullscreen` manifest | Works (`display-mode: fullscreen` matches, no address bar) |
| Screen Wake Lock API | Available (HTTPS only; absent over HTTP) |
| Screen pinning | Not tested; optional, enable if accidental exits happen once mounted (doc 02 §3) |

## Features

| Area | Supported |
|---|---|
| Syntax | ES2015, ES2017 (`async`/`await`), `<script type=module>` (`nomodule` correctly skipped) |
| Built-ins | `Promise` (+ `finally`), `fetch`, `XMLHttpRequest`, `EventSource`, `Symbol`, `Map`/`Set`, `Object.assign`, `Array.from`, `Array.prototype.includes`, `String.prototype.padStart`, `URL`, `URLSearchParams`, `JSON` |
| Intl | Yes, `sk` locale data (`štvrtok 15. januára`), IANA time zones; `toLocaleDateString('sk')` → `15. 1. 2026` |
| Web APIs | `localStorage`, `history.replaceState`, `requestAnimationFrame`, `performance.now`, `performance.memory`, Page Visibility, `matchMedia`, touch + pointer events, `classList` |
| CSS | Flexbox, Grid, custom properties, `CSS.supports`, flex `gap`, `position: sticky`, `calc()`, `vw`/`vh`, unprefixed `transform`, `object-fit` |
| Media | Inline SVG, WOFF2; Slovak diacritics render correctly |
| Network | XHR `GET /healthz` → 200 in 126 ms (HTTPS) |
| Build | Vite `chrome95` "hello" bundle renders (Phase 0 item 8) |

## Performance

60-second `transform` animation probe: **61.4 fps average, worst frame 85 ms** (earlier run over HTTP:
60.7 fps, worst 103 ms). Smooth enough for occasional transitions; the effects budget in doc 02 §2
still applies because of the weak CPU.

## Decisions

- `apps/display` build target **`chrome95`**: native ES modules, `fetch`, CSS Grid/variables; no legacy
  plugin, no polyfills (doc 02 §2, plan Phase 0 item 8).
- Dates formatted with `Intl` in the configured timezone instead of own tables (doc 01 §9).
- Guard against APIs newer than Chrome 95 in `apps/display/src`: TypeScript `lib: ES2022` rejects newer JS
  built-ins, and ESLint (`eslint.config.js`) rejects web APIs the DOM typings know but Chrome 95 lacks
  (`structuredClone`, `AbortSignal.timeout`, `Response.json`, …). CSS is not checked automatically: stay within
  the features listed above.
- TLS via user-installed ISRG Root X1; tablet lock screen must be a PIN (doc 02 §3).
