// Layout document (docs/04-layouts-and-editor.md §1) and grid geometry shared by
// the server validator, the editor and the display.
import type { TileType } from './tiles';

export const LAYOUT_SCHEMA_VERSION = 1;
export const GRID_COLS = 12;
export const GRID_ROWS = 8;
export const MAX_TILES = 24;
export const MAX_LAYOUT_BYTES = 64 * 1024;
/** Stage the grid is designed for; the display scales it to the viewport. */
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 800;

export interface GridBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile<T extends TileType = TileType> extends GridBox {
  id: string;
  type: T;
  config: Record<string, unknown>;
}

export interface LayoutDocument {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  id: string;
  name: string;
  version: number;
  grid: { cols: typeof GRID_COLS; rows: typeof GRID_ROWS; gap: number };
  theme: { accent?: string };
  tiles: Tile[];
}

export function isInsideGrid(box: GridBox): boolean {
  return (
    [box.x, box.y, box.w, box.h].every(Number.isInteger) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.w >= 1 &&
    box.h >= 1 &&
    box.x + box.w <= GRID_COLS &&
    box.y + box.h <= GRID_ROWS
  );
}

export function boxesOverlap(a: GridBox, b: GridBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Pairs of tile ids that overlap; empty when the layout is free of overlaps. */
export function findOverlaps(tiles: readonly (GridBox & { id: string })[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i];
      const b = tiles[j];
      if (a && b && boxesOverlap(a, b)) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs;
}
