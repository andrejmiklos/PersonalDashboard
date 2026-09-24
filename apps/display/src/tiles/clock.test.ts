import { TILE_TYPES, type ClockConfig } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { clockTexts } from './clock';

const TZ = 'Europe/Bratislava';
const NOW = new Date('2026-01-15T07:05:09Z');
const defaults = TILE_TYPES.clock.configDefaults as ClockConfig;

describe('clockTexts', () => {
  it('uses the defaults: 24h, no seconds, long date, no week', () => {
    expect(clockTexts(NOW, defaults, 'sk', TZ)).toEqual({
      time: '08:05',
      date: 'Štvrtok 15. januára',
      week: '',
    });
  });

  it('honours seconds, 12h, short date and week number', () => {
    const config: ClockConfig = {
      ...defaults,
      format: '12h',
      showSeconds: true,
      dateStyle: 'short',
      showWeekNumber: true,
    };
    const texts = clockTexts(NOW, config, 'en', TZ);
    expect(texts.time).toBe('8:05:09 AM');
    expect(texts.week).toBe('Week 3');
    expect(texts.date).toMatch(/^Thu/);
  });

  it('omits the date when disabled', () => {
    expect(clockTexts(NOW, { ...defaults, showDate: false }, 'sk', TZ).date).toBe('');
  });

  it('formats in the configured zone, not the device zone', () => {
    expect(clockTexts(NOW, defaults, 'sk', 'America/New_York').time).toBe('02:05');
  });
});
