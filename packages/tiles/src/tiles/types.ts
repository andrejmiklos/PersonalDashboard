import { formatTime, t, type DataEnvelope, type Locale } from '@dashboard/shared';
import type { DataClient } from '../data';
import type { SizeClass } from '../layout/geometry';

export interface TileContext {
  /** Content element of the tile; the tile owns everything inside it. */
  el: HTMLElement;
  config: Record<string, unknown>;
  locale: Locale;
  timezone: string;
  /** Tile data from the Worker (device token) with the offline copy. */
  data: DataClient;
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Shows a message (loading, error) in place of the tile body. */
export function showMessage(message: HTMLElement, body: HTMLElement, text: string): void {
  setText(message, text);
  message.hidden = false;
  body.hidden = true;
}

/** Message for a failed first load; a missing location or a lost account connection are what the owner can fix. */
export function errorText(locale: Locale, code: string | null): string {
  if (code === 'location_not_set') return t(locale, 'data.noLocation');
  if (code === 'reauth_required') return t(locale, 'data.reauth');
  return t(locale, 'state.error');
}

/** "Updated hh:mm" for a stale payload, empty otherwise. */
export function updatedText(ctx: TileContext, envelope: DataEnvelope<unknown>, stale: boolean): string {
  if (!stale) return '';
  const time = formatTime(new Date(envelope.updatedAt), {
    locale: ctx.locale,
    timeZone: ctx.timezone,
    hour12: false,
    seconds: false,
  });
  return t(ctx.locale, 'state.updatedAt', { time });
}

/**
 * Removes the items (in document order, `itemSelector`) that do not fit below the bottom of `list`, then any
 * group element left without content or with only its header (`headSelector`), so no header stays on its own.
 */
export function cutOverflow(list: HTMLElement, itemSelector: string, headSelector: string): void {
  const limit = list.getBoundingClientRect().bottom + 1;
  const items = Array.from(list.querySelectorAll<HTMLElement>(itemSelector));
  const cutAt = items.findIndex((item) => item.getBoundingClientRect().bottom > limit);
  if (cutAt < 0) return;
  for (let i = items.length - 1; i >= cutAt; i--) items[i]!.remove();
  let last = list.lastElementChild;
  while (
    last &&
    (last.childElementCount === 0 ||
      (last.childElementCount === 1 && last.firstElementChild!.matches(headSelector)))
  ) {
    last.remove();
    last = list.lastElementChild;
  }
}
