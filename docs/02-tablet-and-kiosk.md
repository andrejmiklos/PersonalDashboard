# 02 — Tablet & Kiosk

## 1. Phase 0 checklist (do before implementing)

The engine of the tablet decides the frontend toolchain. Measure first.

1. **Chrome version.** The display runs in **Google Chrome** (D-02), not in a WebView-based kiosk app.
   Settings → Apps → All → *Chrome* (version shown at the bottom). Google Play works on this tablet
   (confirmed by owner).
2. **Update Chrome** through Play Store as far as Android 5 allows; note the final version.
   (Lollipop only receives Chrome updates up to a certain release — record what you get.)
3. **Compatibility spike page** (`/display/spike.html`, first commit of the project): prints
   `navigator.userAgent`, tests `fetch`, `Promise`, CSS variables, CSS Grid, flexbox, `Intl`,
   `localStorage`, `EventSource`, WOFF2, SVG, `requestAnimationFrame`, `position: sticky`,
   plus a simple 60-second animation FPS probe. Open it in Chrome (launched from the home-screen
   shortcut, §3) and record results in `docs/tablet-compat-results.md` (no personal data).
4. **TLS check:** open the deployed `*.workers.dev` URL **with an explicit `https://`** in Chrome on
   the tablet (Chrome silently falls back to `http://` for typed hosts when HTTPS fails, and
   `workers.dev` answers on plain HTTP). Android 5 trusts older root CAs only.
   **Result:** the `workers.dev` certificate chains to *ISRG Root X1*, which Android 5 lacks → install
   it as a user CA (§3 step 0).
5. **Kiosk runtime:** current Fully Kiosk Browser requires Android 6+ and is not offered for this
   tablet, so the kiosk is built from Chrome + home-screen shortcut + screen pinning (§3).
   Record whether the fullscreen shortcut and the Screen Wake Lock API work.
6. **Timezone & clock:** Settings → Date & time → automatic + timezone `Europe/Bratislava`.

Outcome (recorded in [tablet-compat-results.md](tablet-compat-results.md)): Chrome 95, build target
`chrome95`, no polyfills.

## 2. Compatibility rules for `apps/display`

Target: **Chrome 95** (last release for Android 5, measured in Phase 0). Anything Chrome 95 supports
natively may be used; check newer APIs against Chrome 95 before using them.

| Area | Rule |
|---|---|
| JS syntax | Build target `chrome95`; native ES modules. No polyfills |
| HTTP | `fetch` with `AbortController` timeouts |
| Layout | Flexbox, CSS Grid and `gap` allowed; tiles still positioned absolutely in % (D-19) |
| CSS variables | Allowed (design tokens as custom properties) |
| Units | Prefer `rem`/`%`/`vw`; set root font size from viewport width |
| Fonts | Self-hosted WOFF2 — a single family, 2–3 weights; no web-font CDN. Until the Phase 6 design pass the system `sans-serif` is used |
| Icons | Inline SVG; weather icon set with a permissive licence (e.g. MIT/OFL), bundled |
| Dates | `Intl.DateTimeFormat` with `sk`/`en` and the configured `timeZone` (verified) via `shared` helpers |
| Newer APIs | Not in Chrome 95, e.g. `structuredClone` (98), `Array.prototype.findLast` (97), `toSorted` & co. (110), CSS `:has()` and container queries (105). TypeScript `lib` is `ES2022` to catch the JS ones |
| Storage | `localStorage` only; wrap in try/catch |
| Time | Never trust `setInterval` drift: recompute from `Date.now()` for the clock |
| Effects | No `filter: blur`, no big `box-shadow`, no CSS animations on large areas. Use `transform`/`opacity` only when needed |
| DOM | Update text nodes in place; avoid re-rendering whole tiles each poll |

Hardware is weak (≈1.2 GHz quad-core class, ~1.5 GB RAM). Budget: one clock tick/second, tile
re-render only when data actually changed (compare JSON hash).

## 3. Kiosk setup (Chrome)

No third-party kiosk app (D-02). The kiosk is assembled from Chrome and Android 5 built-ins.

0. **Trust ISRG Root X1:** download `isrgrootx1.der` from Let's Encrypt **on a PC** (the tablet cannot
   open letsencrypt.org over HTTPS for the same reason), check its SHA-256 fingerprint
   `96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6`,
   rename to `.cer`, copy over USB, then Settings → Security → *Install from storage* → use for
   *VPN and apps*. Android requires a screen lock (PIN) for user credentials and shows a permanent
   "network may be monitored" notice. Cloudflare may switch the `workers.dev` certificate to another CA
   on renewal; if HTTPS breaks later, re-check the chain.
1. **Pairing (one-time):** open `https://<your-worker-host>/display/` in Chrome, run
   `npm run pair -- --remote` on the PC and type the printed code into the display within 10 minutes. The
   display receives its own device token and keeps it in `localStorage` (doc 06 §2.1). Fallback: open
   `/display/#t=<device-token>` once; the fragment is stripped at once (doc 01 §3.1).
2. **Home-screen shortcut:** Chrome menu → *Add to Home screen*. The web app manifest
   (`/display/manifest.json`, `display: fullscreen`, `orientation: landscape`, `start_url: /display/`)
   makes the shortcut open without the address bar. The start URL carries no token; the stored one is used.
3. **Screen pinning (optional):** guards against accidental exits via the Back/Overview keys next to the
   screen edge; re-pin manually after a reboot. Settings → Security → *Screen pinning* on. Open the shortcut, then Overview
   button → pin icon on the dashboard card. Unpinning needs Back + Overview held together.
   Optionally *Ask for unlock pattern before unpinning*.
4. **Always-on:** Settings → Developer options → **Stay awake** (screen never sleeps while charging).
   `display` also holds a Screen Wake Lock as a second guard (`apps/display/src/wake-lock.ts`, HTTPS only,
   verified in Phase 0). Chrome releases it while the page is hidden, so it is requested again when the page
   becomes visible.
5. Settings → Display → brightness set manually; *Adaptive brightness* off.
6. Lock screen: **PIN** (required by the user CA from step 0; it cannot be set to *None* while the
   certificate is installed). With *Stay awake* it only appears after a reboot. Disable Play Store
   auto-updates for Chrome (Play Store → Chrome → ⋮ → *Enable auto update* off) so an update never
   interrupts the kiosk.
7. Chrome → Settings → turn off translation prompts (the SK UI could otherwise trigger the translate bar).

Things a kiosk app would do and Chrome does not, therefore handled in `display` itself:

| Need | Implementation |
|---|---|
| Reload on page error / network reconnect | Cached state and tile data, stale indicators, offline badge, retry with backoff and at once on `online`; nightly `location.reload()` at 03:30 only when the Worker answers (doc 01 §5) |
| Reload after deploy | `appVersion` change in `/display/state` → `location.reload()` (doc 01 §3.1) |
| No accidental zoom | `<meta name="viewport" … user-scalable=no>`, `touch-action: manipulation` |
| No text selection / context menu on long press | `user-select: none`, `contextmenu` prevented |
| Survive a Chrome crash / tablet reboot | Not covered: after a reboot, open the shortcut and pin it again (manual) |

## 4. Display power: modes and implementation tiers

Server-side state (doc 04): `power_mode ∈ { always_on, scheduled, manual }` plus optional manual
override. The server resolves it to `screen: 'on' | 'off'` in `/display/state`. How "off" is realised
on the device depends on the tier:

| Tier | Requirement | "Off" behaviour |
|---|---|---|
| **A — hardware** | A kiosk runtime with a JS screen API (e.g. Fully Kiosk PLUS) — **not available on this tablet** (Android 5) | Real screen-off via the runtime's API |
| **B — software (used)** | none | `display` renders a **sleep view**: solid black page (optionally a very dim clock moving position every minute). LCD backlight stays on, so this saves no power and the room is not fully dark |

Chrome cannot switch the backlight off, so tier B is the only option (D-02). The implementation:

- keeps screen handling behind a small adapter (`power.ts`) with a single `SoftwarePower`
  implementation, so a tier-A runtime (another device, native wrapper) could be added later without
  touching tiles or the state loop;
- exposes the capability in the `/display/state` heartbeat (`info.power = 'software'`) so the admin
  panel can show "screen off is simulated".

Possible free mitigations to evaluate in Phase 0 (not committed to): lowering Android brightness to the
minimum manually; a free automation app (e.g. MacroDroid/Tasker-class) to change brightness/timeout on a
schedule — check Android 5 support before relying on it.

## 5. Battery & physical notes

- An old Li-ion battery kept at 100 % on a charger 24/7 can swell. Prefer a smart plug / charger with a
  charge limit, or periodically check the device. Never mount it where it cannot be inspected.
- Mount away from direct sun; keep vents free; LCD panel → no burn-in, but the sleep clock still moves.

## 6. Device identity & monitoring

Planned for Phase 5 (`feat(display): heartbeat + device status`); the display does not send any of this yet.

- The device token identifies the device (`device_status.device_id` = token id).
- Every `display/state` poll sends `X-Display-Version` (app build) and, once per minute, a small info
  block (screen size, userAgent, power capability, JS error counter). Server updates `last_seen`.
- Admin panel shows *online / last seen*; a red badge if > 2 min.
- Client-side `window.onerror` → count + last message stored, reported in the next poll (no personal data).
