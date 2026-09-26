import { TILE_TYPES, type WeatherConfig, type WeatherData } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import { formatTemperature, weatherPlan, weatherTexts } from './weather';
import { weatherIcon } from './weather-icons';

const defaults = TILE_TYPES.weather.configDefaults as WeatherConfig;

// Fictional forecast.
const DATA: WeatherData = {
  current: {
    time: '2026-01-15T14:15',
    temperature: 3.4,
    feelsLike: -0.6,
    code: 2,
    isDay: true,
    windSpeed: 12.4,
    precipitation: 0,
  },
  hourly: [
    {
      time: '2026-01-15T15:00',
      temperature: 2.6,
      precipitationProbability: 10,
      code: 61,
      windSpeed: 13.4,
      isDay: true,
    },
    { time: '2026-01-15T16:00', temperature: null, precipitationProbability: null, code: null, isDay: false },
  ],
  daily: [
    { date: '2026-01-15', code: 2, min: -2.2, max: 4.4, precipitationProbability: 40 },
    { date: '2026-01-16', code: 71, min: -3, max: 1, precipitationProbability: 80 },
  ],
};

function box(w: number, h: number) {
  return { refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) };
}

describe('weatherPlan', () => {
  it('shows hours with wind and two days in the default 4×4 tile', () => {
    expect(weatherPlan(box(419, 392), defaults)).toMatchObject({
      compact: false,
      hours: 6,
      hourWind: true,
      days: 2,
      footer: true,
    });
  });

  it('gives up the daily rows first, then the wind row of the strip, then the strip', () => {
    const at = (h: number) => weatherPlan(box(419, h), defaults);
    expect(at(392)).toMatchObject({ hours: 6, hourWind: true, days: 2 });
    expect(at(300)).toMatchObject({ hours: 7, hourWind: true, days: 0 });
    expect(at(260)).toMatchObject({ hours: 7, hourWind: false, days: 0 });
    expect(at(240)).toMatchObject({ hours: 0, hourWind: false, days: 0 });
  });

  it('never lets daily rows replace an hourly strip that did not fit', () => {
    expect(weatherPlan(box(419, 240), defaults).days).toBe(0);
    expect(weatherPlan(box(419, 240), { ...defaults, showHourly: false })).toMatchObject({
      hours: 0,
      days: 2,
    });
  });

  it('needs less height when the second text line is not shown', () => {
    const bare = { ...defaults, showWind: false, showPrecipitation: false };
    expect(weatherPlan(box(419, 240), defaults).hours).toBe(0);
    expect(weatherPlan(box(419, 240), bare).hours).toBe(7);
  });

  it('caps the hourly strip at 8 hours in a wide tile', () => {
    expect(weatherPlan(box(952, 392), defaults).hours).toBe(8);
  });

  it('honours showHourly and dailyDays', () => {
    const plan = weatherPlan(box(419, 392), { ...defaults, showHourly: false, dailyDays: 5 });
    expect(plan).toMatchObject({ hours: 0, days: 5 });
    expect(weatherPlan(box(419, 392), { ...defaults, dailyDays: 0 }).days).toBe(0);
  });

  it('shows only icon and temperature when compact, without the attribution footer', () => {
    expect(weatherPlan(box(205, 92), defaults)).toMatchObject({
      compact: true,
      hours: 0,
      hourWind: false,
      days: 0,
      footer: false,
    });
  });
});

describe('formatTemperature', () => {
  it.each([
    [3.4, '3°'],
    [-2.6, '−3°'],
    [-0.4, '0°'],
    [null, '–'],
  ])('formats %s as %s', (value, text) => {
    expect(formatTemperature(value)).toBe(text);
  });
});

describe('weatherTexts', () => {
  it('puts condition, feels-like and the range of today in line 1, precipitation and wind in line 2', () => {
    const texts = weatherTexts(DATA, defaults, 'sk');
    expect(texts.temperature).toBe('3°');
    expect(texts.line1).toBe('Polojasno · Pocitovo −1° · −2° / 4°');
    expect(texts.line2).toBe('Zrážky 40 % · Vietor 12 km/h');
  });

  it('leaves out disabled parts, and line 2 entirely when nothing is left', () => {
    const noFeels = { ...defaults, showFeelsLike: false, showPrecipitation: false };
    expect(weatherTexts(DATA, noFeels, 'en').line1).toBe('Partly cloudy · −2° / 4°');
    expect(weatherTexts(DATA, noFeels, 'en').line2).toBe('Wind 12 km/h');
    expect(weatherTexts(DATA, { ...noFeels, showWind: false }, 'en').line2).toBe('');
    expect(weatherTexts(DATA, { ...defaults, showWind: false }, 'en').line2).toBe('Precip. 40%');
  });

  it('formats hours with wind as a bare number and keeps missing values readable', () => {
    expect(weatherTexts(DATA, defaults, 'en').hours).toEqual([
      { time: '15:00', temperature: '3°', precipitation: '10%', wind: '13' },
      { time: '16:00', temperature: '–', precipitation: '', wind: '' },
    ]);
    expect(weatherTexts(DATA, { ...defaults, showWind: false }, 'en').hours[0]?.wind).toBe('');
  });

  it('lists the days after today', () => {
    expect(weatherTexts(DATA, defaults, 'sk').days).toEqual([
      { weekday: 'pi', min: '−3°', max: '1°', precipitation: '80 %' },
    ]);
  });
});

describe('weatherIcon', () => {
  it.each([
    [0, true, 'clearDay'],
    [1, false, 'clearNight'],
    [2, false, 'partlyNight'],
    [3, false, 'cloudy'],
    [48, true, 'fog'],
    [53, true, 'drizzle'],
    [67, true, 'sleet'],
    [81, true, 'rain'],
    [86, true, 'snow'],
    [99, true, 'thunder'],
    [null, true, 'cloudy'],
  ] as const)('maps code %s (day %s) to %s', (code, isDay, icon) => {
    expect(weatherIcon(code, isDay)).toBe(icon);
  });
});
