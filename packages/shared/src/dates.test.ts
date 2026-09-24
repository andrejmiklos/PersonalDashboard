import { describe, expect, it } from 'vitest';
import { dayNumber, formatDate, formatTime, isoWeekNumber, localDateString, zonedParts } from './dates';

const TZ = 'Europe/Bratislava';

describe('zonedParts', () => {
  it('applies summer and winter offsets', () => {
    expect(zonedParts(new Date('2026-07-01T10:05:09Z'), TZ)).toEqual({
      year: 2026,
      month: 7,
      day: 1,
      hour: 12,
      minute: 5,
      second: 9,
      weekday: 3,
    });
    expect(zonedParts(new Date('2026-01-15T10:00:00Z'), TZ).hour).toBe(11);
  });

  it('uses 0 for midnight, not 24', () => {
    expect(zonedParts(new Date('2026-01-14T23:00:00Z'), TZ)).toMatchObject({ day: 15, hour: 0, weekday: 4 });
  });
});

describe('localDateString', () => {
  it('follows the local date across midnight', () => {
    expect(localDateString(new Date('2026-01-14T22:59:59Z'), TZ)).toBe('2026-01-14');
    expect(localDateString(new Date('2026-01-14T23:00:00Z'), TZ)).toBe('2026-01-15');
  });
});

describe('dayNumber', () => {
  it('counts days since the epoch', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-01-15') - dayNumber('2026-01-14')).toBe(1);
  });
});

describe('isoWeekNumber', () => {
  it.each([
    [2026, 1, 1, 1],
    [2021, 1, 3, 53],
    [2021, 1, 4, 1],
    [2026, 12, 31, 53],
    [2024, 12, 30, 1],
  ])('%i-%i-%i is week %i', (y, m, d, week) => {
    expect(isoWeekNumber(y, m, d)).toBe(week);
  });
});

describe('formatting', () => {
  const date = new Date('2026-01-15T07:05:09Z');

  it('formats time in the given zone', () => {
    expect(formatTime(date, { locale: 'sk', timeZone: TZ, hour12: false, seconds: false })).toBe('08:05');
    expect(formatTime(date, { locale: 'sk', timeZone: TZ, hour12: false, seconds: true })).toBe('08:05:09');
    expect(formatTime(date, { locale: 'en', timeZone: TZ, hour12: true, seconds: false })).toBe('8:05 AM');
  });

  it('formats a long date with a capital first letter', () => {
    expect(formatDate(date, { locale: 'sk', timeZone: TZ, style: 'long' })).toBe('Štvrtok 15. januára');
    expect(formatDate(date, { locale: 'en', timeZone: TZ, style: 'long' })).toBe('Thursday, January 15');
  });
});
