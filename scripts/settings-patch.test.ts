import { describe, expect, it } from 'vitest';
import { buildSettingsPatch } from './settings-patch.ts';

// Fictional location used only in tests.
describe('buildSettingsPatch', () => {
  it('returns null without options, so the script only shows the settings', () => {
    expect(buildSettingsPatch({})).toBeNull();
  });

  it('builds a location with coordinates rounded to 2 decimals', () => {
    expect(buildSettingsPatch({ location: ' Testville ', lat: '50.1234', lon: '-10.005' })).toEqual({
      location: { label: 'Testville', lat: 50.12, lon: -10.01 },
    });
  });

  it('clears the location', () => {
    expect(buildSettingsPatch({ 'no-location': true })).toEqual({ location: null });
  });

  it('sets locale and time zone', () => {
    expect(buildSettingsPatch({ locale: 'en', timezone: 'Europe/Prague' })).toEqual({
      locale: 'en',
      timezone: 'Europe/Prague',
    });
  });

  it.each([
    [{ location: 'Testville', lat: '50' }, /--lat and --lon/],
    [{ location: 'Testville', lat: '91', lon: '10' }, /--lat must be/],
    [{ location: 'Testville', lat: '50', lon: 'east' }, /--lon must be/],
    [{ location: 'Testville', lat: '', lon: '10' }, /--lat must be/],
    [{ location: '  ', lat: '50', lon: '10' }, /1–64 characters/],
    [{ lat: '50', lon: '10' }, /need --location/],
    [{ location: 'Testville', lat: '50', lon: '10', 'no-location': true }, /either/],
    [{ locale: 'de' }, /sk or en/],
    [{ timezone: 'Mars/Olympus' }, /Unknown time zone/],
  ])('rejects %o', (options, message) => {
    expect(() => buildSettingsPatch(options)).toThrow(message);
  });
});
