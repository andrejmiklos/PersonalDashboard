import { TILE_TYPES, type CountdownConfig } from '@dashboard/shared';
import { countdownFontSizes, countdownView, valueChars } from './countdown-view';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

/** Countdown tile with one event given in its config (docs/03-tiles.md §8); recomputed every minute. */
export function createCountdown(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.countdown.configDefaults, ...ctx.config } as CountdownConfig;
  ctx.el.classList.add('countdown');

  const body = element('div', 'countdown-body', ctx.el);
  const line = element('div', 'countdown-line', body);
  const value = element('span', 'countdown-value', line);
  const unit = element('span', 'countdown-unit', line);
  const label = element('div', 'countdown-label', body);
  label.textContent = config.label;

  let box: TileBox | null = null;
  let timer: number | undefined;

  function layout(): void {
    if (!box) return;
    const { valuePx, labelPx } = countdownFontSizes(
      box,
      valueChars({ value: value.textContent!, unit: unit.textContent! }),
      config.label.length,
    );
    value.style.fontSize = `${valuePx / 16}rem`;
    unit.style.fontSize = `${(valuePx * 0.45) / 16}rem`;
    label.style.fontSize = `${labelPx / 16}rem`;
  }

  function tick(): void {
    const view = countdownView(new Date(), config, ctx.timezone, ctx.locale);
    body.hidden = view.hidden;
    const changed = value.textContent !== view.value || unit.textContent !== view.unit;
    setText(value, view.value);
    setText(unit, view.unit);
    unit.hidden = view.unit === '';
    if (changed) layout();
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
  }

  tick();
  return {
    resize(next) {
      box = next;
      layout();
    },
    destroy() {
      window.clearTimeout(timer);
      ctx.el.replaceChildren();
    },
  };
}
