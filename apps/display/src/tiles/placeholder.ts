import { t, type MessageKey, type TileType } from '@dashboard/shared';
import { element, type TileContext, type TileInstance } from './types';

/** Shown for tile types the display does not implement yet: just the tile's name. */
export function createPlaceholder(type: TileType, ctx: TileContext): TileInstance {
  const label = element('div', 'tile-placeholder', ctx.el);
  label.textContent = t(ctx.locale, `tile.${type}` satisfies MessageKey);
  return {
    resize: () => {},
    destroy: () => label.remove(),
  };
}
