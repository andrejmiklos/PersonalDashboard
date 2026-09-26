// Tile runtime shared by the display and the admin preview (docs/01-architecture.md §2.2).
// Everything here must run in Chrome 95.

export * from './data';
export { createLayoutRenderer, type LayoutRenderer } from './layout/engine';
export { tileRect, type SizeClass, type TileRect } from './layout/geometry';
export { applyStage, fitStage, type StageBox } from './stage';
export type { TileContext, TileFactory, TileInstance } from './tiles/types';
