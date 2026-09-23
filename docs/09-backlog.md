# 09 — Backlog (out of scope for v1)

Ideas raised during requirements gathering but **not selected** by the owner; kept here so they are not lost.

| Idea | Notes |
|---|---|
| Fully Kiosk PLUS integration | Real screen-off/on, screensaver, remote admin REST; supported by the power adapter (doc 02 §4) |
| Light-sensor auto dimming / dark mode | Needs Fully PLUS sensor access or a native wrapper |
| Motion-based wake (camera) | Tablet camera is weak; Fully PLUS feature |
| Public transport departures | Depends on a regional API |
| Spotify "now playing" | OAuth via Spotify API, new provider |
| Photo frame / slideshow | Also useful against image retention |
| RSS headlines, exchange rates, crypto | Simple providers |
| Name days and birthdays | Local SK name-day table + contacts calendar |
| Home Assistant / room sensors | Local network; would need a tunnel from the cloud Worker |
| Custom note / free-text tile | Trivial to add through the tile checklist (doc 03 §10) |
| Multiple displays / per-device layouts | Data model already keys devices by token |
| Editor on the tablet itself | Touch drag & drop on an old WebView is fragile |
| Portrait orientation / per-orientation layouts | Grid model would need `cols`/`rows` per orientation |
| Light theme / automatic day-night theme | Theme tokens exist; switch would be a schedule input |
| Cloudflare Access in front of `/admin` | Optional extra layer, see doc 06 |
| Custom domain | Removes the `workers.dev` host from configuration; also helps with TLS troubleshooting |
