import { describe, expect, it } from 'vitest';
import { buildLocation, isTimeZone, knownTimeZones, parseCoordinate } from './settings-model';

describe('parseCoordinate', () => {
  it('reads a dot or a comma as the decimal separator', () => {
    expect(parseCoordinate('10.5', -90, 90)).toBe(10.5);
    expect(parseCoordinate(' 10,5 ', -90, 90)).toBe(10.5);
    expect(parseCoordinate('-17', -180, 180)).toBe(-17);
  });

  it('accepts the limits and rejects what is beyond them', () => {
    expect(parseCoordinate('90', -90, 90)).toBe(90);
    expect(parseCoordinate('90.01', -90, 90)).toBeNull();
    expect(parseCoordinate('-180.5', -180, 180)).toBeNull();
  });

  it.each(['', 'abc', '48.1.5', '4 8', '1e3', '--1', '48°'])('rejects %j', (text) => {
    expect(parseCoordinate(text, -90, 90)).toBeNull();
  });
});

describe('buildLocation', () => {
  it('builds the value the API takes', () => {
    expect(buildLocation(' Test town ', '10,5', '20.25')).toEqual({
      label: 'Test town',
      lat: 10.5,
      lon: 20.25,
    });
  });

  it('returns null for a missing name or a bad coordinate', () => {
    expect(buildLocation('', '48', '17')).toBeNull();
    expect(buildLocation('x'.repeat(65), '48', '17')).toBeNull();
    expect(buildLocation('Town', '95', '17')).toBeNull();
    expect(buildLocation('Town', '48', '')).toBeNull();
  });
});

describe('isTimeZone', () => {
  it('knows IANA names', () => {
    expect(isTimeZone('Europe/Bratislava')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
  });

  it('rejects unknown names and an empty value', () => {
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});

describe('knownTimeZones', () => {
  it('lists zones where the runtime can', () => {
    const zones = knownTimeZones();
    if (zones.length > 0) expect(zones).toContain('Europe/Bratislava');
  });
});
