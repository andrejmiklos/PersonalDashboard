import { z } from 'zod';
import { LAYOUT_ID_PATTERN } from '../ids';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** ~1 km: enough for weather and sun times, without storing the exact home position. */
function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export const settingsSchemas = {
  locale: z.enum(['sk', 'en']),
  timezone: z.string().max(64).refine(isTimeZone, 'Unknown IANA time zone'),
  location: z
    .strictObject({
      label: z.string().trim().min(1).max(64),
      lat: z.number().min(-90).max(90).transform(roundCoordinate),
      lon: z.number().min(-180).max(180).transform(roundCoordinate),
    })
    .nullable(),
  powerMode: z.enum(['always_on', 'scheduled', 'manual']),
  /** Layout shown when nothing else applies; must exist (checked on PUT). */
  defaultLayoutId: z.string().regex(LAYOUT_ID_PATTERN, 'Invalid layout id').nullable(),
};

export const settingsPatchSchema = z
  .strictObject({
    locale: settingsSchemas.locale.optional(),
    timezone: settingsSchemas.timezone.optional(),
    location: settingsSchemas.location.optional(),
    powerMode: settingsSchemas.powerMode.optional(),
    defaultLayoutId: settingsSchemas.defaultLayoutId.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one setting is required');

export type SettingKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingKey]: z.output<(typeof settingsSchemas)[K]> };
export type SettingsPatch = z.output<typeof settingsPatchSchema>;

/** Used until the owner sets a value. The location is never part of the repository (D-15). */
export const DEFAULT_SETTINGS: Settings = {
  locale: 'sk',
  timezone: 'Europe/Bratislava',
  location: null,
  powerMode: 'always_on',
  defaultLayoutId: null,
};

export const SETTING_KEYS = Object.keys(settingsSchemas) as SettingKey[];
