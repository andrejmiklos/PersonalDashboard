# 02 — Tablet & Kiosk

## 1. Phase 0 checklist (do before implementing)

The engine of the tablet decides the frontend toolchain. Measure first.

1. **WebView version.** Settings → Apps → All → *Android System WebView* (version shown at the bottom),
   or Play Store → search *Android System WebView* → *Update*. Fully Kiosk also reports it in
   *Device info*. Google Play works on this tablet (confirmed by owner).
2. **Update WebView and Chrome** through Play Store as far as Android 5 allows; note the final version.
   (Lollipop only receives WebView updates up to a certain release — record what you get.)
3. **Compatibility spike page** (`/display/spike.html`, first commit of the project): prints
   `navigator.userAgent`, tests `fetch`, `Promise`, CSS variables, CSS Grid, flexbox, `Intl`,
   `localStorage`, `EventSource`, WOFF2, SVG, `requestAnimationFrame`, `position: sticky`,
   plus a simple 60-second animation FPS probe. Open it in Fully Kiosk and record results in
   `docs/tablet-compat-results.md` (no personal data).
4. **TLS check:** open the deployed `*.workers.dev` URL in the tablet's WebView. Android 5 trusts
   older root CAs only; Cloudflare's chain must validate. (Let's Encrypt-only chains broke on old
   Android after 2021/2024 root changes — if the check fails, use a different origin/cert setup.)
5. **Fully Kiosk compatibility:** confirm the Play Store lists it as compatible with Android 5.0.2;
   otherwise sideload an older APK from the vendor.
6. **Timezone & clock:** Settings → Date & time → automatic + timezone `Europe/Bratislava`.

Outcome of Phase 0 sets: the `browserslist` for `apps/display`, whether CSS variables/`fetch` may be
used, and whether polyfills are needed.

## 2. Compatibility rules for `apps/display`

Assume worst case (Chrome ≈ 37 WebView) until Phase 0 proves otherwise.

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

## 3. Fully Kiosk Browser settings

Start URL: `https://<your-worker-host>/display/#t=<device-token>` — the token is entered **only in
Fully Kiosk's settings on the device**, never committed anywhere.

Recommended settings (verify which exist in the free edition):

- Web Content → Start URL as above; *Reload on page error*; *Reload on network reconnect*.
- Web Content Settings → *Enable Zoom* off; *Keep screen on* on.
- Device Management → *Keep screen on* / *Screen brightness* set manually.
- Kiosk Mode → enable if available (lock navigation, hide status bar), set a PIN.
- Android: Developer options → **Stay awake** (screen never sleeps while charging) — free alternative
  for always-on.
- Settings → Display → Sleep: 30 min if not using Stay awake.
- Disable OS auto-updates during the night; disable lock screen (Security → none).

## 4. Display power: modes and implementation tiers

Server-side state (doc 04): `power_mode ∈ { always_on, scheduled, manual }` plus optional manual
override. The server resolves it to `screen: 'on' | 'off'` in `/display/state`. How "off" is realised
on the device depends on the tier:

| Tier | Requirement | "Off" behaviour |
|---|---|---|
| **A — hardware** | Fully Kiosk **PLUS** (paid, ~€8 one-off): JS interface / REST API | Real screen-off / screensaver via Fully's API. `display` calls `fully.turnScreenOff()` when `screen: 'off'` and `fully.turnScreenOn()` when `on`. Optionally also server → tablet via Fully Remote Admin |
| **B — software (default, free)** | none | `display` renders a **sleep view**: solid black page (optionally a very dim clock moving position every minute). LCD backlight stays on, so this saves no power and the room is not fully dark |

Owner chose the free path initially (D-02). Because tier B cannot switch the backlight off, the
implementation must:

- put all `fully.*` calls behind a small adapter (`power.ts`) with `NoopPower` (tier B) and
  `FullyPower` (tier A) implementations, selected by feature detection (`typeof fully !== 'undefined'`);
- expose the resulting capability in `/display/state` heartbeat (`info.power = 'software' | 'fully'`)
  so the admin panel can show "screen off is simulated";
- allow later upgrade to tier A with **no code change** except buying the licence.

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
