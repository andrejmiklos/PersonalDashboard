import { STAGE_HEIGHT, STAGE_WIDTH, type GridBox } from '@dashboard/shared';

export type SizeClass = 'compact' | 'regular' | 'large';

export interface TileRect {
  /** Percent of the stage (docs/04-layouts-and-editor.md §1.1). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Size in reference pixels of the 1280×800 stage; the stage scales uniformly. */
  refWidth: number;
  refHeight: number;
  sizeClass: SizeClass;
}

export function sizeClassOf(refWidth: number, refHeight: number): SizeClass {
  if (refWidth < 200 || refHeight < 120) return 'compact';
  if (refWidth >= STAGE_WIDTH / 2 && refHeight >= STAGE_HEIGHT / 2) return 'large';
  return 'regular';
}

export function tileRect(box: GridBox, cols: number, rows: number): TileRect {
  const refWidth = (box.w / cols) * STAGE_WIDTH;
  const refHeight = (box.h / rows) * STAGE_HEIGHT;
  return {
    left: (box.x / cols) * 100,
    top: (box.y / rows) * 100,
    width: (box.w / cols) * 100,
    height: (box.h / rows) * 100,
    refWidth,
    refHeight,
    sizeClass: sizeClassOf(refWidth, refHeight),
  };
}
