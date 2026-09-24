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
4. **TLS check:** open the deployed `*.workers.dev` URL in Chrome on the tablet. Android 5 trusts
   older root CAs only; Cloudflare's chain must validate. (Let's Encrypt-only chains broke on old
   Android after 2021/2024 root changes — if the check fails, use a different origin/cert setup.)
5. **Kiosk runtime:** current Fully Kiosk Browser requires Android 6+ and is not offered for this
   tablet, so the kiosk is built from Chrome + home-screen shortcut + screen pinning (§3).
   Record whether the fullscreen shortcut and the Screen Wake Lock API work.
6. **Timezone & clock:** Settings → Date & time → automatic + timezone `Europe/Bratislava`.

Outcome of Phase 0 sets: the `browserslist` for `apps/display`, whether CSS variables/`fetch` may be
used, and whether polyfills are needed.

## 2. Compatibility rules for `apps/display`

Assume worst case (Chrome ≈ 37) until Phase 0 proves otherwise. The last Chrome release for Android 5
is expected to be much newer; the measured version replaces these rules in `docs/tablet-compat-results.md`.

| Area | Rule |
|---|---|
| JS syntax | Transpile to ES5. No runtime reliance on ES2015+ built-ins without polyfill |
| HTTP | Use `XMLHttpRequest` (thin wrapper); no `fetch` (Chrome 42+) |
| Promises | Native from Chrome 32, but the wrapper must not depend on newer APIs |
| Layout | Flexbox + absolute positioning with `%`/`vw`/`vh`. **No CSS Grid** (Chrome 57), no `gap` for flex, no `position: sticky` |
| CSS variables | Avoid unless the Phase 0 check passes (Chrome 49). Use build-time tokens (PostCSS) as fallback |
| Units | Prefer `rem`/`%`/`vw`; set root font size from viewport width |
| Fonts | Self-hosted WOFF (WOFF2 ok since Chrome 36) — a single family, 2–3 weights; no web-font CDN |
| Icons | Inline SVG; weather icon set with a permissive licence (e.g. MIT/OFL), bundled |
| Dates | Own SK/EN formatting; do not rely on `Intl` locale data |
| Storage | `localStorage` only; wrap in try/catch |
| Time | Never trust `setInterval` drift: recompute from `Date.now()` for the clock |
| Effects | No `filter: blur`, no big `box-shadow`, no CSS animations on large areas. Use `transform`/`opacity` only when needed |
| DOM | Update text nodes in place; avoid re-rendering whole tiles each poll |

Hardware is weak (≈1.2 GHz quad-core class, ~1.5 GB RAM). Budget: one clock tick/second, tile
re-render only when data actually changed (compare JSON hash).

## 3. Kiosk setup (Chrome)

No third-party kiosk app (D-02). The kiosk is assembled from Chrome and Android 5 built-ins.

1. **Token (one-time):** open `https://<your-worker-host>/display/#t=<device-token>` in Chrome.
   `display` stores the token in `localStorage` and strips the hash (doc 01 §3.1). The token is typed
   **only on the device**, never committed anywhere.
2. **Home-screen shortcut:** Chrome menu → *Add to Home screen*. The web app manifest
   (`/display/manifest.json`, `display: fullscreen`, `orientation: landscape`, `start_url: /display/`)
   makes the shortcut open without the address bar. The start URL carries no token; the stored one is used.
3. **Screen pinning:** Settings → Security → *Screen pinning* on. Open the shortcut, then Overview
   button → pin icon on the dashboard card. Unpinning needs Back + Overview held together.
   Optionally *Ask for unlock pattern before unpinning*.
4. **Always-on:** Settings → Developer options → **Stay awake** (screen never sleeps while charging).
   If the Screen Wake Lock API works (Phase 0), `display` also requests a wake lock as a second guard.
5. Settings → Display → brightness set manually; *Adaptive brightness* off.
6. Disable lock screen (Security → none); disable Play Store auto-updates for Chrome during the
   night (Play Store → Chrome → ⋮ → *Enable auto update* off) so an update never interrupts the kiosk.
7. Chrome → Settings → turn off translation prompts (the SK UI could otherwise trigger the translate bar).

Things a kiosk app would do and Chrome does not, therefore handled in `display` itself:

| Need | Implementation |
|---|---|
| Reload on page error / network reconnect | Offline/stale handling + retry with backoff; nightly `location.reload()` (Phase 2.13) |
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

- The device token identifies the device (`device_status.device_id` = token id).
- Every `display/state` poll sends `X-Display-Version` (app build) and, once per minute, a small info
  block (screen size, userAgent, power capability, JS error counter). Server updates `last_seen`.
- Admin panel shows *online / last seen*; a red badge if > 2 min.
- Client-side `window.onerror` → count + last message stored, reported in the next poll (no personal data).
