import {
  dayNumber,
  localDateString,
  t,
  zonedTimeToInstant,
  type CountdownConfig,
  type Locale,
} from '@dashboard/shared';
import type { TileBox } from './types';

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
 * What a countdown shows at `now`. Days are calendar days in `timeZone`; a date-only target is "today"
 * for its whole day, a target with a time has passed once that time is reached.
 */
export function countdownView(
  now: Date,
  config: Pick<CountdownConfig, 'target' | 'showTime' | 'afterBehaviour'>,
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

/**
 * Font sizes in px of the big number and of the label under it. The number is sized by its length so
 * short values ("12") get big and durations still fit; the label follows the box, so it stays readable.
 */
export function countdownFontSizes(
  box: TileBox,
  chars: number,
  labelLength: number,
): { valuePx: number; labelPx: number } {
  const compact = box.sizeClass === 'compact';
  const valuePx = Math.min(
    box.refHeight * (compact ? 0.5 : 0.45),
    (box.refWidth * 0.9) / (Math.max(chars, 2) * 0.58),
  );
  const labelPx = Math.max(
    12,
    Math.min(
      box.refHeight * (compact ? 0.16 : 0.13),
      (box.refWidth * 0.9) / (Math.max(labelLength, 1) * 0.55),
    ),
  );
  return { valuePx, labelPx };
}

/** Length of the number line in characters: the unit counts a little less than digits. */
export function valueChars(view: Pick<CountdownView, 'value' | 'unit'>): number {
  return view.value.length + (view.unit ? view.unit.length * 0.45 + 1 : 0);
}
