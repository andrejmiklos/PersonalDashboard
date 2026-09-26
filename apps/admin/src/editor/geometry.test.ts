import { GRID_COLS, GRID_ROWS, TILE_TYPES, type Tile } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import {
  clampBox,
  dragBox,
  firstFreeArea,
  overlapsOthers,
  place,
  snapToCells,
  stepBox,
  uniqueTileId,
} from './geometry';

const tile = (id: string, type: Tile['type'], x: number, y: number, w: number, h: number): Tile => ({
  id,
  type,
  x,
  y,
  w,
  h,
  config: {},
});

describe('snapToCells', () => {
  it('rounds a pointer movement to whole cells', () => {
    expect(snapToCells(49, 100)).toBe(0);
    expect(snapToCells(51, 100)).toBe(1);
    expect(snapToCells(-160, 100)).toBe(-2);
  });

  it('ignores a cell size that is not positive', () => {
    expect(snapToCells(50, 0)).toBe(0);
  });
});

describe('clampBox', () => {
  it('keeps a valid box as it is', () => {
    expect(clampBox({ x: 2, y: 1, w: 4, h: 2 }, 'clock')).toEqual({ x: 2, y: 1, w: 4, h: 2 });
  });

  it('pulls a box that sticks out back into the grid', () => {
    expect(clampBox({ x: 11, y: 7, w: 4, h: 2 }, 'clock')).toEqual({ x: 8, y: 6, w: 4, h: 2 });
    expect(clampBox({ x: -3, y: -1, w: 4, h: 2 }, 'clock')).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  it('raises the size to the minimum of the tile type', () => {
    const { minW, minH } = TILE_TYPES.calendar;
    expect(clampBox({ x: 0, y: 0, w: 1, h: 1 }, 'calendar')).toEqual({ x: 0, y: 0, w: minW, h: minH });
  });

  it('never exceeds the grid', () => {
    expect(clampBox({ x: 0, y: 0, w: 99, h: 99 }, 'clock')).toEqual({
      x: 0,
      y: 0,
      w: GRID_COLS,
      h: GRID_ROWS,
    });
  });

  it('rounds to whole cells', () => {
    expect(clampBox({ x: 1.4, y: 2.6, w: 4.2, h: 2.5 }, 'clock')).toEqual({ x: 1, y: 3, w: 4, h: 3 });
  });
});

describe('dragBox', () => {
  const start = { x: 4, y: 2, w: 3, h: 3 };

  it('moves and stops at the grid edges', () => {
    expect(dragBox(start, 'calendar', 'move', 2, 1)).toEqual({ x: 6, y: 3, w: 3, h: 3 });
    expect(dragBox(start, 'calendar', 'move', 50, 50)).toEqual({ x: 9, y: 5, w: 3, h: 3 });
    expect(dragBox(start, 'calendar', 'move', -50, -50)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  });

  it('resizes from the bottom-right corner and keeps the top-left one', () => {
    expect(dragBox(start, 'calendar', 'resize', 2, 1)).toEqual({ x: 4, y: 2, w: 5, h: 4 });
  });

  it('does not resize below the minimum or beyond the grid', () => {
    const { minW, minH } = TILE_TYPES.calendar;
    expect(dragBox(start, 'calendar', 'resize', -9, -9)).toEqual({ x: 4, y: 2, w: minW, h: minH });
    expect(dragBox(start, 'calendar', 'resize', 50, 50)).toEqual({
      x: 4,
      y: 2,
      w: GRID_COLS - 4,
      h: GRID_ROWS - 2,
    });
  });
});

describe('overlapsOthers', () => {
  const tiles = [tile('a', 'clock', 0, 0, 4, 2), tile('b', 'weather', 4, 0, 4, 4)];

  it('detects an overlap with another tile', () => {
    expect(overlapsOthers(tiles, 'a', { x: 3, y: 0, w: 2, h: 2 })).toBe(true);
  });

  it('lets boxes that only touch share an edge', () => {
    expect(overlapsOthers(tiles, 'a', { x: 0, y: 0, w: 4, h: 2 })).toBe(false);
    expect(overlapsOthers(tiles, 'x', { x: 0, y: 2, w: 4, h: 2 })).toBe(false);
  });

  it('does not count the tile itself', () => {
    expect(overlapsOthers(tiles, 'b', { x: 4, y: 0, w: 4, h: 4 })).toBe(false);
  });
});

describe('place', () => {
  const a = tile('a', 'clock', 0, 0, 4, 2);
  const b = tile('b', 'weather', 6, 0, 4, 4);
  const tiles = [a, b];

  it('is valid on free cells', () => {
    expect(place(tiles, a, 'move', 0, 3)).toEqual({ box: { x: 0, y: 3, w: 4, h: 2 }, valid: true });
  });

  it('is invalid over another tile, and still shows where the box would be', () => {
    expect(place(tiles, a, 'move', 4, 0)).toEqual({ box: { x: 4, y: 0, w: 4, h: 2 }, valid: false });
  });

  it('is invalid when a resize runs into a neighbour', () => {
    expect(place(tiles, a, 'resize', 3, 0).valid).toBe(false);
    expect(place(tiles, a, 'resize', 2, 0).valid).toBe(true);
  });

  it('is valid when the drag changes nothing', () => {
    expect(place(tiles, a, 'move', 0, 0)).toEqual({ box: { x: 0, y: 0, w: 4, h: 2 }, valid: true });
  });
});

describe('firstFreeArea', () => {
  it('puts the first tile in the top-left corner at its default size', () => {
    const { defaultW, defaultH } = TILE_TYPES.clock;
    expect(firstFreeArea([], 'clock')).toEqual({ x: 0, y: 0, w: defaultW, h: defaultH });
  });

  it('goes right, then down, to the first free spot', () => {
    const tiles = [tile('a', 'clock', 0, 0, 4, 2)];
    expect(firstFreeArea(tiles, 'clock')).toEqual({ x: 4, y: 0, w: 4, h: 2 });
    const wide = [tile('a', 'quote', 0, 0, 12, 2)];
    expect(firstFreeArea(wide, 'clock')).toEqual({ x: 0, y: 2, w: 4, h: 2 });
  });

  it('shrinks the tile to what is left, not below its minimum', () => {
    // Only a 3×2 hole is left at the right edge; a clock (default 4×2, minimum 2×1) takes it.
    const tiles = [
      tile('a', 'quote', 0, 0, 9, 2),
      tile('b', 'weather', 0, 2, 12, 6),
      tile('c', 'air', 9, 0, 3, 1),
    ];
    expect(firstFreeArea(tiles, 'clock')).toEqual({ x: 9, y: 1, w: 3, h: 1 });
  });

  it('returns null when nothing fits', () => {
    expect(firstFreeArea([tile('a', 'quote', 0, 0, 12, 8)], 'clock')).toBeNull();
    // A calendar needs at least 3×3.
    const tiles = [tile('a', 'quote', 0, 0, 12, 6), tile('b', 'quote', 0, 6, 12, 1)];
    expect(firstFreeArea(tiles, 'calendar')).toBeNull();
  });
});

describe('uniqueTileId', () => {
  it('uses the type as the id while it is free', () => {
    expect(uniqueTileId([], 'clock')).toBe('clock');
  });

  it('numbers further tiles of the same type', () => {
    const tiles = [tile('clock', 'clock', 0, 0, 2, 1), tile('clock-2', 'clock', 2, 0, 2, 1)];
    expect(uniqueTileId(tiles, 'clock')).toBe('clock-3');
  });

  it('fills a gap in the numbering', () => {
    const tiles = [tile('clock', 'clock', 0, 0, 2, 1), tile('clock-3', 'clock', 2, 0, 2, 1)];
    expect(uniqueTileId(tiles, 'clock')).toBe('clock-2');
  });

  it('gives ids the server accepts', () => {
    for (const type of Object.keys(TILE_TYPES) as Tile['type'][]) {
      expect(uniqueTileId([], type)).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    }
  });
});

describe('stepBox', () => {
  const a = tile('a', 'clock', 0, 0, 4, 2);
  const b = tile('b', 'weather', 4, 0, 4, 4);

  it('changes one field by one cell', () => {
    expect(stepBox([a, b], a, 'y', 1)).toEqual({ x: 0, y: 1, w: 4, h: 2 });
    expect(stepBox([a, b], a, 'h', 1)).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(stepBox([a, b], b, 'x', 1)).toEqual({ x: 5, y: 0, w: 4, h: 4 });
  });

  it('refuses to leave the grid', () => {
    expect(stepBox([a, b], a, 'x', -1)).toBeNull();
    expect(stepBox([a, b], a, 'y', -1)).toBeNull();
    const right = tile('c', 'clock', 8, 6, 4, 2);
    expect(stepBox([right], right, 'x', 1)).toBeNull();
    expect(stepBox([right], right, 'h', 1)).toBeNull();
  });

  it('refuses to go below the minimum size', () => {
    const { minW, minH } = TILE_TYPES.clock;
    const small = tile('s', 'clock', 0, 0, minW, minH);
    expect(stepBox([small], small, 'w', -1)).toBeNull();
    expect(stepBox([small], small, 'h', -1)).toBeNull();
  });

  it('refuses to run into another tile', () => {
    expect(stepBox([a, b], a, 'w', 1)).toBeNull();
    expect(stepBox([a, b], a, 'x', 1)).toBeNull();
  });
});
