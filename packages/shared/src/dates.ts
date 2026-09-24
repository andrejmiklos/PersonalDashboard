// Time-zone aware date helpers built on Intl (available on the tablet's Chrome 95 and on Workers).
// Formatters are cached: the clock tile formats every second on a weak CPU.
import type { Locale } from './locale';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: Monday = 1 … Sunday = 7. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Calendar fields of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 0,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date `YYYY-MM-DD` in `timeZone`. */
export function localDateString(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Days since 1970-01-01 for a `YYYY-MM-DD` string; used for deterministic daily rotation. */
export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** ISO 8601 week number of a calendar date. */
export function isoWeekNumber(year: number, month: number, day: number): number {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  // The Thursday of the same ISO week decides the week-numbering year.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export interface TimeFormat {
  locale: Locale;
  timeZone: string;
  hour12: boolean;
  seconds: boolean;
}

export function formatTime(date: Date, f: TimeFormat): string {
  return formatter(f.locale, {
    timeZone: f.timeZone,
    hour: f.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(f.seconds ? { second: '2-digit' } : {}),
    hourCycle: f.hour12 ? 'h12' : 'h23',
  }).format(date);
}

export interface DateFormat {
  locale: Locale;
  timeZone: string;
  style: 'long' | 'short';
}

/** Long: "Štvrtok 24. septembra" / "Thursday, September 24"; short: "št 24. 9." / "Thu, 9/24". */
export function formatDate(date: Date, f: DateFormat): string {
  const text = formatter(f.locale, {
    timeZone: f.timeZone,
    weekday: f.style,
    day: 'numeric',
    month: f.style === 'long' ? 'long' : 'numeric',
  }).format(date);
  return text.charAt(0).toLocaleUpperCase(f.locale) + text.slice(1);
}
