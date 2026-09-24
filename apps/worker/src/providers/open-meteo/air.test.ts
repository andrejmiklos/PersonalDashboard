import { describe, expect, it } from 'vitest';
import { ProviderError } from '../types';
import { airProvider, airUrl, mapAir, type OpenMeteoAir } from './air';

// Fictional response.
function airFixture(): OpenMeteoAir {
  return { current: { time: '2026-01-15T14:00', european_aqi: 18, pm2_5: 4.6, pm10: 8.9 } };
}

describe('airUrl', () => {
  it('asks only for the current index and particles', () => {
    const url = new URL(airUrl({ lat: 50, lon: 10, timezone: 'Europe/Bratislava' }));
    expect(url.origin + url.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '50',
      longitude: '10',
      current: 'european_aqi,pm2_5,pm10',
      timezone: 'Europe/Bratislava',
    });
  });
});

describe('airProvider', () => {
  it('refreshes hourly and keys the cache by location and zone', () => {
    expect(airProvider.ttlSeconds).toBe(3600);
    expect(airProvider.cacheKey({ lat: 50, lon: 10, timezone: 'Europe/Bratislava' })).toBe(
      'air:v1:50:10:Europe/Bratislava',
    );
  });
});

describe('mapAir', () => {
  it('maps the current values', () => {
    expect(mapAir(airFixture())).toEqual({ time: '2026-01-15T14:00', aqi: 18, pm2_5: 4.6, pm10: 8.9 });
  });

  it('keeps missing model values as null', () => {
    const raw = airFixture();
    raw.current.european_aqi = null;
    raw.current.pm10 = null;
    expect(mapAir(raw)).toMatchObject({ aqi: null, pm10: null });
  });

  it.each<[string, (raw: Record<string, Record<string, unknown>>) => void]>([
    ['a missing current block', (raw) => delete raw.current],
    ['a negative concentration', (raw) => (raw.current!.pm2_5 = -1)],
    ['a text value', (raw) => (raw.current!.european_aqi = 'good')],
    ['a malformed time', (raw) => (raw.current!.time = '14:00')],
  ])('rejects %s without echoing values', (_, mutate) => {
    const raw = airFixture() as unknown as Record<string, Record<string, unknown>>;
    mutate(raw);
    expect(() => mapAir(raw)).toThrow(ProviderError);
    expect(() => mapAir(raw)).toThrow(/^Unexpected air quality response at [\w.()]+$/);
  });
});
