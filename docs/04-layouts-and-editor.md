# 04 — Layouts, Editor, Scheduling

## 1. Layout model

A **layout** is a named, versioned JSON document. The tablet renders it 1:1 — what is saved is what is shown.

```jsonc
{
  "schemaVersion": 1,
  "id": "lay_9f3a…",              // server-generated
  "name": "Morning",
  "version": 7,                    // incremented by the server on every save
  "grid": { "cols": 12, "rows": 8, "gap": 8 },   // gap in px at 1280×800 (scaled with viewport)
  "theme": { "accent": "#4FC3F7" },               // dark theme is fixed; accent is optional
  "tiles": [
    { "id": "t1", "type": "clock",    "x": 0, "y": 0, "w": 4, "h": 2, "config": { "showSeconds": false } },
    { "id": "t2", "type": "calendar", "x": 4, "y": 0, "w": 5, "h": 6, "config": { "sourceIds": ["src_a", "src_b"] } },
    { "id": "t3", "type": "weather",  "x": 9, "y": 0, "w": 3, "h": 4, "config": {} }
  ]
}
```

Rules (validated on the server and mirrored in the editor):

- `0 ≤ x`, `x + w ≤ cols`, `0 ≤ y`, `y + h ≤ rows`; integers only.
- `w ≥ minW`, `h ≥ minH` of the tile type (doc 03 registry).
- **No overlaps** between tiles.
- Tile `id` unique within the layout; `type` ∈ registry; `config` validated against the type's schema
  (unknown keys rejected; missing keys filled with defaults on save).
- `sourceIds` must reference existing, enabled sources of the right kind.
- ≤ 24 tiles per layout; JSON ≤ 64 KB.
- Layout content contains **no secrets**; it references sources by id only.

Grid: 12 columns × 8 rows on a 1280×800 canvas (16:10). One cell ≈ 106.7 × 100 px. The editor's grid
and the tablet share the same coordinate system, so the preview is exact.

### 1.1 Rendering (display)

```
tile box (percent of the viewport):
  left   = x / cols * 100 %
  top    = y / rows * 100 %
  width  = w / cols * 100 %
  height = h / rows * 100 %
inner padding = gap / 2 (px, scaled)
```

Absolute positioning with percentages — maps 1:1 to editor grid coordinates. Root font size is
derived from viewport width (`1rem = viewportWidth / 80`, i.e. 16 px at 1280) so all tile
typography scales.

If the physical viewport aspect ratio differs from 16:10 the stage is letterboxed (centered, black
bars), never stretched.

## 2. Editor (apps/admin)

### 2.1 Screens

1. **Layouts** — list with thumbnail previews, name, last modified; actions: *New*, *Duplicate*,
   *Rename*, *Delete* (confirm), *Set as active now*, *Import/Export JSON*.
2. **Editor** — canvas + palette + properties.
3. **Schedule & modes** — power mode, schedule rules, rotation, default layout.
4. **Control** — quick actions: screen on/off, pin a layout, clear override, device status.
5. **Accounts & sources** — connect Google/Microsoft, choose calendars/lists, colours, status.
6. **Settings** — locale (SK/EN), timezone, location (city + coordinates), tokens (create/revoke), About/licences.

### 2.2 Editor UX

- **Canvas** = 1280×800 stage scaled to the available width, showing grid lines while dragging.
- **Palette**: tile types with icon + name; drag onto the canvas or tap *Add* (places at the first
  free area of default size).
- **Move / resize** by drag (pointer events; works with mouse and touch on the phone). Snaps to grid.
  Invalid drops (overlap / out of range) are rejected with a red ghost and revert; optional
  auto-shift of neighbours is **not** implemented (simplicity).
- **Properties panel** (right on desktop, bottom sheet on phone): form generated from the tile's
  config schema, with source pickers for calendar/tasks tiles.
- **Live preview**: the canvas renders real tile components with **sample data** (or real data via the
  admin token — toggle) at true 1280×800 layout scaled with CSS `transform`.
- **Draft vs saved**: edits are local drafts (autosaved to `localStorage`); *Save* validates and
  `PUT`s. Unsaved-changes guard on navigation. Save creates the next `version`.
- **Undo/redo**: in-memory stack (≥ 50 steps) for add/move/resize/config/delete.
- **Keyboard** (desktop): arrows move selected tile, shift+arrows resize, Delete removes, Ctrl+Z/Y.
- **Send to tablet**: *Save & show now* = save + set manual override to this layout.

### 2.2.1 As built (Phase 4)

- **Resize** is by the corner handle of the selected tile only (top-left changes with move + resize). Beside the
  drag, the properties panel has **steppers** for column, row, width and height (± one cell): the precise way on a
  phone, where one cell is about 30 px. A stepper is disabled when the step would leave the grid, go below the
  minimum size or run into another tile.
- On a **touch screen the first tap only selects** a tile, the next drag moves it; so the tiles do not block
  scrolling the page.
- **Live preview:** the real tiles (`packages/tiles`) with fictional sample data, or real data from the Worker
  (toggle, remembered in the browser; answers are kept for a minute). The tiles use the language and time zone of
  the tablet settings. Ticking a task in the preview changes nothing. A tile the server would refuse (no source
  chosen, countdown without a name or date) is outlined in the editor and left out of the picture.
- **Drafts:** the unsaved layout is kept in the browser (`localStorage`, half a second after the last edit) and
  offered again on the next visit, unless the layout was saved elsewhere in the meantime (its version differs).
  Leaving the editor with unsaved changes asks first, also for the back button and closing the tab.
- **Undo/redo:** 100 steps, buttons and Ctrl+Z / Ctrl+Y; typing in one text field is one step.
- **Keys:** arrows move the selected tile, Shift+arrows resize it, Delete removes it, Esc deselects, Ctrl+S saves.
- **Save and show now** saves, then pins the layout on the tablet (`PUT /api/v1/override`, doc 07 §5); the tablet
  changes within its poll interval of 15 seconds. The layout list can show a layout now and release the pin.
- **Settings screen (minimal):** tablet language, time zone and the location of the weather and sun tiles.
  Power mode, schedule and rotation come with Phase 5.

### 2.3 Accessibility & i18n

SK/EN, sufficient contrast, touch targets ≥ 44 px, all actions keyboard-reachable on desktop.

## 3. Choosing what the tablet shows

Two independent axes, both resolved **on the server** so the tablet just obeys.

### 3.1 Power (screen) mode — `settings.power_mode`

| Mode | Behaviour |
|---|---|
| `always_on` | `screen = on` always |
| `scheduled` | `screen` from schedule rules: a rule with `layout_id = NULL` means *off* during that window; outside "off" windows the screen is on. Example: off 23:00–06:30 |
| `manual` | `screen` = value of the manual override (`on`/`off`), persistent until changed |

A temporary manual override (`overrides.screen` with `expires_at`) can be applied in any mode
("turn on for 1 hour", "off until tomorrow's schedule").

### 3.2 Layout selection

Candidates, highest priority first:

1. **Manual pin** (`overrides.layout_id`, admin) — optional expiry; while set, touch switching is disabled.
2. **Touch selection** (client-side, temporary) — on the tablet the user can swipe left/right (or tap
   a small unobtrusive layout button) to cycle through layouts marked `touchSwitch = true`. It auto-reverts
   to the server-resolved layout after `touchTimeoutSec` (default 300 s; 0 = never).
3. **Schedule rule** — the matching rule with the highest `priority` (then latest `from_min`) for the
   current local weekday/time.
4. **Default mode**: `fixed` → `default_layout_id`, or `rotation` → playlist.

**Rotation** is stateless: settings hold `{ layoutIds: [...], secondsEach: 30–3600, anchor: ISO }`;
the tablet computes `index = floor((now − anchor) / secondsEach) mod n` from server time
(`serverTime` from state; client keeps offset), so multiple displays stay in sync and no state is
written.

### 3.3 State resolution (server)

```ts
function resolveState(now: Date, s: Settings, rules, override): DisplayState {
  const local = toLocal(now, s.timezone);

  const ov = activeOverride(override, now);          // ignores expired rows
  // --- screen ---
  let screen: 'on' | 'off';
  if (ov?.screen) screen = ov.screen;
  else if (s.powerMode === 'always_on') screen = 'on';
  else if (s.powerMode === 'manual') screen = 'on';   // no override set → default on
  else screen = matchesOffRule(rules, local) ? 'off' : 'on';

  // --- layout ---
  let layoutSpec: LayoutSpec;
  if (ov?.layoutId) layoutSpec = { pinned: ov.layoutId };
  else {
    const r = bestRule(rules.filter(r => r.layoutId), local);
    if (r) layoutSpec = { layoutId: r.layoutId };
    else if (s.defaultMode === 'rotation') layoutSpec = { rotation: s.rotation };
    else layoutSpec = { layoutId: s.defaultLayoutId };
  }
  return { screen, layoutSpec, serverTime: now.toISOString(), touch: s.touch };
}
```

Windows crossing midnight (e.g. 22:00–06:00) are stored as one rule and evaluated as
`from ≤ t || t < to` when `from > to`, with the weekday of the *start* of the window.

The response embeds the full layout document(s) needed (current, plus the touch-cycle list and the rotation
playlist) so the tablet needs no further layout requests. Total size stays small (≤ 64 KB per layout).

### 3.4 "Shows exactly what I saved"

- `layout.version` is part of state; tablet compares and re-renders on change.
- The server never mutates a layout except on explicit save (defaults filled at save time, not read time).
- Deleting a layout that is referenced by a rule / default / rotation is rejected (409) with the list of
  referencing items, or the editor offers "replace with…".

## 4. Schedule editor

- Rules list: days (Mon–Sun chips), from–to time, target (layout or *Screen off*), priority.
- Validation: `from ≠ to`; overlap allowed (priority decides) but the editor warns.
- A 24-hour × 7-day preview bar shows the resolved timeline (computed with the same `resolveState`
  logic compiled into the admin bundle from `packages/shared`).
- Default layout / rotation config at the top; power mode selector.

## 5. Sample layouts (in `examples/`)

Provide 2–3 fictional layouts (no real data): `morning.json`, `evening-minimal.json`,
`night-clock.json` — used by tests, editor "Import example", and README screenshots.
