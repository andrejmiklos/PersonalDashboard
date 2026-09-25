// Normalised weather payload of `GET /api/v1/data/weather`, independent of the provider.
// Times are local to the configured time zone (`YYYY-MM-DDTHH:mm`, dates `YYYY-MM-DD`).
// Units: °C, km/h, mm, %. `code` is a WMO weather interpretation code (0–99).

export interface WeatherCurrent {
  time: string;
  temperature: number;
  feelsLike: number | null;
  code: number;
  isDay: boolean;
  windSpeed: number | null;
  precipitation: number | null;
}

export interface WeatherHour {
  time: string;
  temperature: number | null;
  precipitationProbability: number | null;
  code: number | null;
  isDay: boolean;
}

export interface WeatherDay {
  date: string;
  code: number | null;
  min: number | null;
  max: number | null;
  precipitationProbability: number | null;
}

export interface WeatherData {
  current: WeatherCurrent;
  /** The hours after the current one. */
  hourly: WeatherHour[];
  /** Today first. */
  daily: WeatherDay[];
  /**
   * Name of the place from the settings, added by the Worker to every answer (never cached, so a renamed
   * location shows at once). Missing in copies stored on a tablet before it existed.
   */
  place?: string;
}

export type WeatherCondition =
  | 'clear'
  | 'mainlyClear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'freezingDrizzle'
  | 'rain'
  | 'freezingRain'
  | 'snow'
  | 'snowGrains'
  | 'rainShowers'
  | 'snowShowers'
  | 'thunderstorm'
  | 'thunderstormHail'
  | 'unknown';

const CONDITIONS: [WeatherCondition, number[]][] = [
  ['clear', [0]],
  ['mainlyClear', [1]],
  ['partlyCloudy', [2]],
  ['overcast', [3]],
  ['fog', [45, 48]],
  ['drizzle', [51, 53, 55]],
  ['freezingDrizzle', [56, 57]],
  ['rain', [61, 63, 65]],
  ['freezingRain', [66, 67]],
  ['snow', [71, 73, 75]],
  ['snowGrains', [77]],
  ['rainShowers', [80, 81, 82]],
  ['snowShowers', [85, 86]],
  ['thunderstorm', [95]],
  ['thunderstormHail', [96, 99]],
];

/** WMO weather interpretation code → condition; its text is the i18n key `weather.<condition>`. */
export function weatherCondition(code: number | null): WeatherCondition {
  for (const [condition, codes] of CONDITIONS) {
    if (code !== null && codes.includes(code)) return condition;
  }
  return 'unknown';
}

/** Hours after the current one in `WeatherData.hourly` (docs/03-tiles.md §5). */
export const WEATHER_HOURS = 8;
/** Today + 5 days, the maximum of the tile's `dailyDays`. */
export const WEATHER_DAYS = 6;
