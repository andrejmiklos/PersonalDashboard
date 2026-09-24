// Builds the body of PUT /api/v1/settings from command-line options. The Worker validates again;
// checking here gives a clear message before the token is asked for.

export interface SettingsOptions {
  location?: string;
  lat?: string;
  lon?: string;
  'no-location'?: boolean;
  locale?: string;
  timezone?: string;
}

function coordinate(name: string, raw: string | undefined, limit: number): number {
  if (raw === undefined) {
    throw new Error(`--location needs --lat and --lon (negative values as --${name}=-1.5)`);
  }
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new Error(`--${name} must be a number between -${limit} and ${limit}`);
  }
  // ~1 km is enough for weather and sun times (docs/05-integrations.md §3).
  return Math.round(value * 100) / 100;
}

/** Returns null when no setting is given (the script then only shows the current settings). */
export function buildSettingsPatch(options: SettingsOptions): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  if (options.location !== undefined && options['no-location']) {
    throw new Error('Use either --location or --no-location');
  }
  if (options.location !== undefined) {
    const label = options.location.trim();
    if (label === '' || label.length > 64) {
      throw new Error('--location must be 1–64 characters');
    }
    patch['location'] = {
      label,
      lat: coordinate('lat', options.lat, 90),
      lon: coordinate('lon', options.lon, 180),
    };
  } else if (options.lat !== undefined || options.lon !== undefined) {
    throw new Error('--lat and --lon need --location <label>');
  }
  if (options['no-location']) patch['location'] = null;

  if (options.locale !== undefined) {
    if (options.locale !== 'sk' && options.locale !== 'en') {
      throw new Error('--locale must be sk or en');
    }
    patch['locale'] = options.locale;
  }
  if (options.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: options.timezone });
    } catch {
      throw new Error(`Unknown time zone: ${options.timezone}`);
    }
    patch['timezone'] = options.timezone;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
