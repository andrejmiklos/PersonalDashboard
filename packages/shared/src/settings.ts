import type { Locale } from './locale';

export type PowerMode = 'always_on' | 'scheduled' | 'manual';

/** The place of the weather and sun tiles; coordinates are rounded to ~1 km by the server. */
export interface SettingsLocation {
  label: string;
  lat: number;
  lon: number;
}

/** `GET /api/v1/settings` (docs/07-api.md §5). */
export interface AppSettings {
  locale: Locale;
  timezone: string;
  location: SettingsLocation | null;
  powerMode: PowerMode;
  /** Layout shown when nothing else applies. */
  defaultLayoutId: string | null;
}
