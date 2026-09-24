import type { Locale } from '@dashboard/shared';
import type { SizeClass } from '../layout/geometry';

export interface TileContext {
  /** Content element of the tile; the tile owns everything inside it. */
  el: HTMLElement;
  config: Record<string, unknown>;
  locale: Locale;
  timezone: string;
}

export interface TileBox {
  /** Inner size in reference pixels of the 1280×800 stage (convert with px / 16 → rem). */
  refWidth: number;
  refHeight: number;
  sizeClass: SizeClass;
}

/** A mounted tile (docs/01-architecture.md §2.2). */
export interface TileInstance {
  resize(box: TileBox): void;
  destroy(): void;
}

export type TileFactory = (ctx: TileContext) => TileInstance;

/** Replaces text only when it changed, so polls and ticks do not churn the DOM. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function element(tag: string, className: string, parent: HTMLElement): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  parent.appendChild(el);
  return el;
}
