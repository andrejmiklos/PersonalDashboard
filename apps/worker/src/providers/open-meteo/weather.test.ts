import { describe, expect, it } from 'vitest';
import { forecastFixture } from '../../test/open-meteo-forecast';
import { ProviderError } from '../types';
import { mapWeather, weatherProvider, weatherUrl } from './weather';

type Mutable = Record<string, Record<string, unknown>>;

describe('weatherUrl', () => {
  it('sends only coordinates, time zone and field lists', () => {
    const url = new URL(weatherUrl({ lat: 50, lon: 10.25, timezone: 'Europe/Bratislava' }));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['current', 'daily', 'forecast_days', 'hourly', 'latitude', 'longitude', 'timezone'].sort(),
    );
    expect(url.searchParams.get('latitude')).toBe('50');
    expect(url.searchParams.get('longitude')).toBe('10.25');
    expect(url.searchParams.get('timezone')).toBe('Europe/Bratislava');
    expect(url.searchParams.get('forecast_days')).toBe('6');
  });
});

describe('weatherProvider.cacheKey', () => {
  it('changes with the location and the time zone', () => {
    const base = { lat: 50, lon: 10, timezone: 'Europe/Bratislava' };
    const key = weatherProvider.cacheKey(base);
    expect(weatherProvider.cacheKey({ ...base, lat: 50.01 })).not.toBe(key);
    expect(weatherProvider.cacheKey({ ...base, timezone: 'Europe/Prague' })).not.toBe(key);
  });
});

describe('mapWeather', () => {
  it('maps current conditions', () => {
    expect(mapWeather(forecastFixture()).current).toEqual({
      time: '2026-01-15T14:15',
      temperature: 3.4,
      feelsLike: 0.9,
      code: 3,
      isDay: true,
      windSpeed: 12.5,
      precipitation: 0,
    });
  });

  it('returns the 8 hours after the current one with day/night', () => {
    const { hourly } = mapWeather(forecastFixture());
    expect(hourly.map((h) => h.time)).toEqual([
      '2026-01-15T15:00',
      '2026-01-15T16:00',
      '2026-01-15T17:00',
      '2026-01-15T18:00',
      '2026-01-15T19:00',
      '2026-01-15T20:00',
      '2026-01-15T21:00',
      '2026-01-15T22:00',
    ]);
    expect(hourly[0]).toEqual({
      time: '2026-01-15T15:00',
      temperature: 7.5,
      precipitationProbability: 10,
      code: 61,
      windSpeed: 13.75,
      isDay: true,
    });
    expect(hourly[1]?.isDay).toBe(false);
  });

  it('starts after the current hour when "now" is on the hour', () => {
    const raw = forecastFixture();
    raw.current.time = '2026-01-15T20:00';
    const times = mapWeather(raw).hourly.map((h) => h.time);
    expect(times[0]).toBe('2026-01-15T21:00');
    expect(times.slice(2, 4)).toEqual(['2026-01-15T23:00', '2026-01-16T00:00']);
  });

  it('returns today and the next 5 days', () => {
    const { daily } = mapWeather(forecastFixture());
    expect(daily).toHaveLength(6);
    expect(daily[0]).toEqual({ date: '2026-01-15', code: 71, min: -2, max: 4, precipitationProbability: 40 });
    expect(daily[5]?.date).toBe('2026-01-20');
  });

  it('keeps missing model values as null', () => {
    const raw = forecastFixture();
    raw.current.apparent_temperature = null;
    raw.hourly.temperature_2m[15] = null;
    raw.hourly.weather_code[15] = null;
    raw.hourly.is_day[15] = null;
    raw.hourly.wind_speed_10m[15] = null;
    raw.daily.temperature_2m_min[0] = null;
    const data = mapWeather(raw);
    expect(data.current.feelsLike).toBeNull();
    expect(data.hourly[0]).toMatchObject({ temperature: null, code: null, windSpeed: null, isDay: true });
    expect(data.daily[0]?.min).toBeNull();
  });

  it('returns shorter lists near the end of the forecast', () => {
    const raw = forecastFixture();
    raw.current.time = '2026-01-20T20:00';
    const data = mapWeather(raw);
    expect(data.hourly.map((h) => h.time)).toEqual([
      '2026-01-20T21:00',
      '2026-01-20T22:00',
      '2026-01-20T23:00',
    ]);
    expect(data.daily.map((d) => d.date)).toEqual(['2026-01-20']);
  });

  it.each<[string, (raw: Mutable) => void]>([
    ['a missing current temperature', (raw) => delete raw.current!.temperature_2m],
    ['an unknown weather code', (raw) => (raw.current!.weather_code = 150)],
    ['series of different length', (raw) => (raw.hourly!.temperature_2m as unknown[]).pop()],
    ['a malformed time', (raw) => (raw.current!.time = '2026-01-15 14:15')],
    ['an error body', (raw) => ['current', 'hourly', 'daily'].forEach((key) => delete raw[key])],
  ])('rejects %s', (_, mutate) => {
    const raw = forecastFixture() as unknown as Mutable;
    mutate(raw);
    expect(() => mapWeather(raw)).toThrow(ProviderError);
  });

  it('does not put received values into the error message', () => {
    const raw = forecastFixture() as unknown as Mutable;
    raw.current!.temperature_2m = 'secret-looking-value';
    expect(() => mapWeather(raw)).toThrow(/^Unexpected forecast response at current\.temperature_2m$/);
  });
});
