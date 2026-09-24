import {
  dayNumber,
  localDateString,
  t,
  TILE_TYPES,
  zonedTimeToInstant,
  type CountdownConfig,
  type Locale,
} from '@dashboard/shared';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

const TARGET = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/;

export interface CountdownView {
  /** True when the event has passed and `afterBehaviour` is `hide`. */
  hidden: boolean;
  value: string;
  unit: string;
}

function duration(ms: number, locale: Locale): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return d > 0
    ? t(locale, 'countdown.duration', { d, h, m })
    : t(locale, 'countdown.durationShort', { h, m });
}

function days(n: number, locale: Locale): CountdownView {
  return { hidden: false, value: String(n), unit: t(locale, 'countdown.days', { n }) };
}

/**
 * What the tile shows at `now`. Days are calendar days in `timeZone`; a date-only target is "today"
 * for its whole day, a target with a time has passed once that time is reached.
 */
export function countdownView(
  now: Date,
  config: CountdownConfig,
  timeZone: string,
  locale: Locale,
): CountdownView {
  const match = TARGET.exec(config.target);
  if (!match) return { hidden: false, value: '–', unit: '' };
  const date = match[1]!;
  const time = match[2] ?? null;

  const dayDiff = dayNumber(date) - dayNumber(localDateString(now, timeZone));
  const instant = zonedTimeToInstant(`${date}T${time ?? '00:00'}`, timeZone).getTime();
  const passed = time !== null ? now.getTime() >= instant : dayDiff < 0;
  const today: CountdownView = { hidden: false, value: t(locale, 'countdown.today'), unit: '' };

  if (!passed) {
    if (config.showTime && (time !== null || dayDiff > 0)) {
      return { hidden: false, value: duration(instant - now.getTime(), locale), unit: '' };
    }
    return dayDiff === 0 ? today : days(dayDiff, locale);
  }

  switch (config.afterBehaviour) {
    case 'hide':
      return { hidden: true, value: '', unit: '' };
    case 'since':
      if (config.showTime && time !== null) {
        return { hidden: false, value: duration(now.getTime() - instant, locale), unit: '' };
      }
      return dayDiff === 0
        ? today
        : { hidden: false, value: String(-dayDiff), unit: t(locale, 'countdown.since', { n: -dayDiff }) };
    default:
      return days(0, locale);
  }
}

/** Countdown tile (docs/03-tiles.md §8); recomputed every minute from the device clock. */
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
    // Size the number line by its length so short values ("12") get big and durations still fit.
    const chars = value.textContent!.length + (unit.textContent ? unit.textContent.length * 0.45 + 1 : 0);
    const compact = box.sizeClass === 'compact';
    const valuePx = Math.min(
      box.refHeight * (compact ? 0.5 : 0.45),
      (box.refWidth * 0.9) / (Math.max(chars, 2) * 0.58),
    );
    // The label follows the box, not the value, so it stays readable next to long durations.
    const labelPx = Math.max(
      12,
      Math.min(box.refHeight * (compact ? 0.16 : 0.13), (box.refWidth * 0.9) / (config.label.length * 0.55)),
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
