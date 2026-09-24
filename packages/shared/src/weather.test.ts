import { describe, expect, it } from 'vitest';
import { formatWeekday } from './dates';
import { t, type MessageKey } from './i18n';
import { weatherCondition } from './weather';

describe('weatherCondition', () => {
  it.each([
    [0, 'clear'],
    [1, 'mainlyClear'],
    [2, 'partlyCloudy'],
    [3, 'overcast'],
    [48, 'fog'],
    [53, 'drizzle'],
    [57, 'freezingDrizzle'],
    [65, 'rain'],
    [66, 'freezingRain'],
    [71, 'snow'],
    [77, 'snowGrains'],
    [81, 'rainShowers'],
    [86, 'snowShowers'],
    [95, 'thunderstorm'],
    [99, 'thunderstormHail'],
  ])('maps WMO code %i to %s', (code, condition) => {
    expect(weatherCondition(code)).toBe(condition);
  });

  it('treats unassigned and missing codes as unknown', () => {
    expect(weatherCondition(4)).toBe('unknown');
    expect(weatherCondition(null)).toBe('unknown');
  });

  it('has a text for every condition in both languages', () => {
    for (let code = 0; code <= 99; code++) {
      const key = `weather.${weatherCondition(code)}` as MessageKey;
      expect(t('sk', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });
});

describe('formatWeekday', () => {
  it('formats the calendar day regardless of the runtime zone', () => {
    expect(formatWeekday('2026-01-15', 'en')).toBe('Thu');
    expect(formatWeekday('2026-01-18', 'sk')).toBe('ne');
  });
});
