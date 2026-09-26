import type { SettingsLocation } from '@dashboard/shared';

const MAX_PLACE = 64;

/** `48,15` and `48.15` both work: a Slovak keyboard types a decimal comma. Null when out of range. */
export function parseCoordinate(text: string, min: number, max: number): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return value >= min && value <= max ? value : null;
}

/** The location as `PUT /api/v1/settings` takes it, or null when a field is missing or out of range. */
export function buildLocation(place: string, lat: string, lon: string): SettingsLocation | null {
  const label = place.trim();
  const latitude = parseCoordinate(lat, -90, 90);
  const longitude = parseCoordinate(lon, -180, 180);
  if (label.length < 1 || label.length > MAX_PLACE || latitude === null || longitude === null) return null;
  return { label, lat: latitude, lon: longitude };
}

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value.trim() !== '';
  } catch {
    return false;
  }
}

/** The IANA names the browser knows, for the suggestions of the time zone field. */
export function knownTimeZones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return supported ? supported('timeZone') : [];
}
