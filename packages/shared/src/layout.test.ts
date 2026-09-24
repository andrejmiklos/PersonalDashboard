import { describe, expect, it } from 'vitest';
import { boxesOverlap, findOverlaps, GRID_COLS, GRID_ROWS, isInsideGrid } from './layout';
import { TILE_TYPES } from './tiles';

describe('isInsideGrid', () => {
  it('accepts boxes within the 12×8 grid', () => {
    expect(isInsideGrid({ x: 0, y: 0, w: 12, h: 8 })).toBe(true);
    expect(isInsideGrid({ x: 11, y: 7, w: 1, h: 1 })).toBe(true);
  });

  it.each([
    { x: -1, y: 0, w: 2, h: 2 },
    { x: 11, y: 0, w: 2, h: 1 },
    { x: 0, y: 7, w: 1, h: 2 },
    { x: 0, y: 0, w: 0, h: 1 },
    { x: 0.5, y: 0, w: 2, h: 2 },
    { x: Number.NaN, y: 0, w: 2, h: 2 },
  ])('rejects %j', (box) => {
    expect(isInsideGrid(box)).toBe(false);
  });
});

describe('overlaps', () => {
  it('treats touching edges as not overlapping', () => {
    expect(boxesOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
    expect(boxesOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
  });

  it('lists overlapping pairs', () => {
    const tiles = [
      { id: 'a', x: 0, y: 0, w: 4, h: 2 },
      { id: 'b', x: 4, y: 0, w: 4, h: 2 },
      { id: 'c', x: 3, y: 1, w: 2, h: 2 },
    ];
    expect(findOverlaps(tiles)).toEqual([
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });
});

describe('TILE_TYPES', () => {
  it('has consistent sizes that fit the grid', () => {
    for (const [type, meta] of Object.entries(TILE_TYPES)) {
      expect(meta.type).toBe(type);
      expect(meta.defaultW).toBeGreaterThanOrEqual(meta.minW);
      expect(meta.defaultH).toBeGreaterThanOrEqual(meta.minH);
      expect(meta.defaultW).toBeLessThanOrEqual(GRID_COLS);
      expect(meta.defaultH).toBeLessThanOrEqual(GRID_ROWS);
    }
  });
});
