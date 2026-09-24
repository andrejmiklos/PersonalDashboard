import type { LayoutDocument, Locale, TileType } from '@dashboard/shared';
import { createPlaceholder } from '../tiles/placeholder';
import type { TileFactory, TileInstance } from '../tiles/types';
import { tileRect } from './geometry';

/** Implemented tile modules; other types render a placeholder. */
const factories: Partial<Record<TileType, TileFactory>> = {};

interface Mounted {
  key: string;
  root: HTMLElement;
  tiles: TileInstance[];
}

let mounted: Mounted | null = null;

/**
 * Renders a layout into the stage. Nothing is rebuilt unless the layout, its version, the locale
 * or the timezone changed, so repeated polls do not touch the DOM.
 */
export function renderLayout(
  stage: HTMLElement,
  layout: LayoutDocument,
  locale: Locale,
  timezone: string,
): void {
  const key = `${layout.id}|${layout.version}|${locale}|${timezone}`;
  if (mounted?.key === key) return;
  clearLayout();

  const root = document.createElement('div');
  root.className = 'layout';
  if (layout.theme.accent) root.style.setProperty('--accent', layout.theme.accent);
  // Gap is defined in px at 1280 wide, i.e. rem × 16.
  const padding = `${layout.grid.gap / 2 / 16}rem`;

  const tiles: TileInstance[] = [];
  for (const tile of layout.tiles) {
    const rect = tileRect(tile, layout.grid.cols, layout.grid.rows);
    const box = document.createElement('div');
    box.className = `tile tile-${tile.type} size-${rect.sizeClass}`;
    box.style.left = `${rect.left}%`;
    box.style.top = `${rect.top}%`;
    box.style.width = `${rect.width}%`;
    box.style.height = `${rect.height}%`;
    box.style.padding = padding;
    const content = document.createElement('div');
    content.className = 'tile-content';
    box.appendChild(content);
    root.appendChild(box);

    const ctx = { el: content, config: tile.config, locale, timezone };
    const factory = factories[tile.type];
    const instance = factory ? factory(ctx) : createPlaceholder(tile.type, ctx);
    const inset = layout.grid.gap;
    instance.resize({
      refWidth: rect.refWidth - inset,
      refHeight: rect.refHeight - inset,
      sizeClass: rect.sizeClass,
    });
    tiles.push(instance);
  }

  stage.appendChild(root);
  mounted = { key, root, tiles };
}

export function clearLayout(): void {
  if (!mounted) return;
  for (const tile of mounted.tiles) tile.destroy();
  mounted.root.remove();
  mounted = null;
}
