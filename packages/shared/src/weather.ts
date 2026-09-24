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
}

/** Hours after the current one in `WeatherData.hourly` (docs/03-tiles.md §5). */
export const WEATHER_HOURS = 8;
/** Today + 5 days, the maximum of the tile's `dailyDays`. */
export const WEATHER_DAYS = 6;
