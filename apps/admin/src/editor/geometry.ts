import {
  boxesOverlap,
  GRID_COLS,
  GRID_ROWS,
  TILE_TYPES,
  type GridBox,
  type Tile,
  type TileType,
} from '@dashboard/shared';

// Editor geometry (docs/04-layouts-and-editor.md §1 and §2.2): the same rules the server checks on save,
// as pure functions on grid cells. Invalid drops are not repaired, they are reported so the canvas can show
// a red ghost and revert.

export type DragMode = 'move' | 'resize';

export interface Placement {
  box: GridBox;
  /** False when the box overlaps another tile. Position and size are always inside the grid. */
  valid: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Whole grid cells of a pointer movement of `pixels`, when one cell is `cellPixels` wide (or high). */
export function snapToCells(pixels: number, cellPixels: number): number {
  return cellPixels > 0 ? Math.round(pixels / cellPixels) : 0;
}

/** Position and size limited to the grid, the size to at least the tile type's minimum. */
export function clampBox(box: GridBox, type: TileType): GridBox {
  const { minW, minH } = TILE_TYPES[type];
  const w = clamp(Math.round(box.w), minW, GRID_COLS);
  const h = clamp(Math.round(box.h), minH, GRID_ROWS);
  return {
    x: clamp(Math.round(box.x), 0, GRID_COLS - w),
    y: clamp(Math.round(box.y), 0, GRID_ROWS - h),
    w,
    h,
  };
}

/** `move` shifts the box; `resize` moves the bottom-right corner and keeps the top-left one in place. */
export function dragBox(start: GridBox, type: TileType, mode: DragMode, dx: number, dy: number): GridBox {
  if (mode === 'move') return clampBox({ ...start, x: start.x + dx, y: start.y + dy }, type);
  const { minW, minH } = TILE_TYPES[type];
  return {
    x: start.x,
    y: start.y,
    w: clamp(start.w + dx, minW, GRID_COLS - start.x),
    h: clamp(start.h + dy, minH, GRID_ROWS - start.y),
  };
}

export function overlapsOthers(tiles: readonly Tile[], id: string, box: GridBox): boolean {
  return tiles.some((other) => other.id !== id && boxesOverlap(box, other));
}

/** Where a drag of `dx`, `dy` cells puts the tile and whether it may stay there. */
export function place(tiles: readonly Tile[], tile: Tile, mode: DragMode, dx: number, dy: number): Placement {
  const box = dragBox(tile, tile.type, mode, dx, dy);
  return { box, valid: !overlapsOthers(tiles, tile.id, box) };
}

function isFree(tiles: readonly Tile[], box: GridBox): boolean {
  return !tiles.some((tile) => boxesOverlap(box, tile));
}

/**
 * The first free area (rows first, then columns) for a new tile of `type`: its default size, or the largest
 * smaller size down to the minimum that still fits. Null when the grid has no room left.
 */
export function firstFreeArea(tiles: readonly Tile[], type: TileType): GridBox | null {
  const { minW, minH, defaultW, defaultH } = TILE_TYPES[type];
  const sizes: { w: number; h: number }[] = [];
  for (let w = defaultW; w >= minW; w--) {
    for (let h = defaultH; h >= minH; h--) sizes.push({ w, h });
  }
  sizes.sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);

  for (const { w, h } of sizes) {
    for (let y = 0; y + h <= GRID_ROWS; y++) {
      for (let x = 0; x + w <= GRID_COLS; x++) {
        const box = { x, y, w, h };
        if (isFree(tiles, box)) return box;
      }
    }
  }
  return null;
}

const TILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** `clock`, then `clock-2`, `clock-3`, …: unique in the layout and valid for the server. */
export function uniqueTileId(tiles: readonly Tile[], type: TileType): string {
  const taken = new Set(tiles.map((tile) => tile.id));
  if (!taken.has(type)) return type;
  for (let n = 2; ; n++) {
    const id = `${type}-${n}`;
    if (!taken.has(id) && TILE_ID_PATTERN.test(id)) return id;
  }
}
