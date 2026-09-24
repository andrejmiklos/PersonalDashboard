import { describe, expect, it } from 'vitest';
import { computeAstro, moonPhaseName } from './compute';

// Fictional locations; published 2026 moon phase dates serve as reference.
const MID = { lat: 50, lon: 10 };
const TZ = 'Europe/Bratislava';

describe('computeAstro', () => {
  it('gives long summer and short winter days at mid latitudes', () => {
    const june = computeAstro('2026-06-21', MID.lat, MID.lon, TZ);
    expect(june.dayLengthMin).toBeGreaterThan(975);
    expect(june.dayLengthMin).toBeLessThan(990);
    const december = computeAstro('2026-12-21', MID.lat, MID.lon, TZ);
    expect(december.dayLengthMin).toBeGreaterThan(478);
    expect(december.dayLengthMin).toBeLessThan(490);
  });

  it('returns sunrise and sunset of the requested local date as UTC instants', () => {
    const astro = computeAstro('2026-09-24', MID.lat, MID.lon, TZ);
    expect(astro.date).toBe('2026-09-24');
    expect(astro.sunrise).toMatch(/^2026-09-24T05:\d{2}:\d{2}\.\d{3}Z$/);
    expect(astro.sunset).toMatch(/^2026-09-24T17:\d{2}:\d{2}\.\d{3}Z$/);
    expect(astro.dayLengthMin).toBe(
      Math.round((Date.parse(astro.sunset!) - Date.parse(astro.sunrise!)) / 60_000),
    );
  });

  it('picks the right solar day far from Greenwich', () => {
    // Local sunrise near 07:00 is still the previous day in UTC.
    const astro = computeAstro('2026-06-21', -33.87, 151.21, 'Australia/Sydney');
    expect(astro.sunrise).toMatch(/^2026-06-20T2\d:/);
    expect(astro.sunset).toMatch(/^2026-06-21T0\d:/);
  });

  it('handles polar day and polar night', () => {
    expect(computeAstro('2026-06-21', 78, 15, 'Europe/Oslo')).toMatchObject({
      sunrise: null,
      sunset: null,
      dayLengthMin: 1440,
    });
    expect(computeAstro('2026-12-21', 78, 15, 'Europe/Oslo')).toMatchObject({
      sunrise: null,
      sunset: null,
      dayLengthMin: 0,
    });
  });

  it('describes the moon and finds the next principal phase', () => {
    const astro = computeAstro('2026-09-24', MID.lat, MID.lon, TZ);
    expect(astro.moon.name).toBe('waxingGibbous');
    expect(astro.moon.illumination).toBeGreaterThan(0.9);
    expect(astro.nextPhase).toEqual({ name: 'full', date: '2026-09-26' });
    expect(computeAstro('2026-12-21', MID.lat, MID.lon, TZ).nextPhase).toEqual({
      name: 'full',
      date: '2026-12-24',
    });
  });

  it('crosses the new moon when looking for the next phase', () => {
    // Waning crescent a few days before a new moon.
    const astro = computeAstro('2026-10-07', MID.lat, MID.lon, TZ);
    expect(astro.moon.name).toBe('waningCrescent');
    expect(astro.nextPhase.name).toBe('new');
  });
});

describe('moonPhaseName', () => {
  it.each([
    [0, 'new'],
    [0.06, 'new'],
    [0.07, 'waxingCrescent'],
    [0.25, 'firstQuarter'],
    [0.5, 'full'],
    [0.75, 'lastQuarter'],
    [0.9, 'waningCrescent'],
    [0.97, 'new'],
  ] as const)('names phase %s %s', (phase, name) => {
    expect(moonPhaseName(phase)).toBe(name);
  });
});
