import {
  formatDate,
  formatTime,
  isoWeekNumber,
  t,
  TILE_TYPES,
  zonedParts,
  type ClockConfig,
  type Locale,
} from '@dashboard/shared';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

export interface ClockTexts {
  time: string;
  date: string;
  week: string;
}

export function clockTexts(now: Date, config: ClockConfig, locale: Locale, timeZone: string): ClockTexts {
  const time = formatTime(now, {
    locale,
    timeZone,
    hour12: config.format === '12h',
    seconds: config.showSeconds,
  });
  const date = config.showDate ? formatDate(now, { locale, timeZone, style: config.dateStyle }) : '';
  let week = '';
  if (config.showWeekNumber) {
    const p = zonedParts(now, timeZone);
    week = t(locale, 'clock.week', { n: isoWeekNumber(p.year, p.month, p.day) });
  }
  return { time, date, week };
}

/** Widest text each line can reach, in characters, so the font size does not jump between minutes. */
function maxChars(config: ClockConfig): { time: number; date: number } {
  const time = (config.format === '12h' ? 8 : 5) + (config.showSeconds ? 3 : 0);
  return { time, date: config.dateStyle === 'long' ? 22 : 12 };
}

/** Clock tile (docs/03-tiles.md §1); ticks aligned to the next second or minute. */
export function createClock(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.clock.configDefaults, ...ctx.config } as ClockConfig;
  const timeEl = element('div', 'clock-time', ctx.el);
  const dateEl = element('div', 'clock-date', ctx.el);
  const weekEl = element('div', 'clock-week', ctx.el);
  let timer: number | undefined;

  function tick(): void {
    const texts = clockTexts(new Date(), config, ctx.locale, ctx.timezone);
    setText(timeEl, texts.time);
    setText(dateEl, texts.date);
    setText(weekEl, texts.week);
    const period = config.showSeconds ? 1000 : 60_000;
    // Small offset so the tick lands just after the boundary, not just before it.
    timer = window.setTimeout(tick, period - (Date.now() % period) + 20);
  }

  function resize(box: TileBox): void {
    const showDate = config.showDate && box.refHeight >= 120;
    const showWeek = config.showWeekNumber && box.sizeClass !== 'compact';
    dateEl.hidden = !showDate;
    weekEl.hidden = !showWeek;

    const chars = maxChars(config);
    // Height of the date and week lines (font + margin) relative to the time line.
    const lines = (showDate ? 0.45 : 0) + (showWeek ? 0.35 : 0);
    const timePx = Math.min((box.refHeight * 0.8) / (1 + lines), (box.refWidth * 0.9) / (chars.time * 0.6));
    const datePx = Math.min(timePx * 0.28, (box.refWidth * 0.9) / (chars.date * 0.5));
    timeEl.style.fontSize = `${timePx / 16}rem`;
    dateEl.style.fontSize = `${datePx / 16}rem`;
    weekEl.style.fontSize = `${(datePx * 0.8) / 16}rem`;
  }

  tick();
  return {
    resize,
    destroy: () => {
      window.clearTimeout(timer);
      ctx.el.replaceChildren();
    },
  };
}
