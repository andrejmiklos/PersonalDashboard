import { WEATHER_DAYS, WEATHER_HOURS, type WeatherData } from '@dashboard/shared';
import { z } from 'zod';
import { fetchJson, ProviderError, type Provider } from '../types';

export interface WeatherParams {
  lat: number;
  lon: number;
  timezone: string;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Only the rounded coordinates and the time zone leave the Worker (docs/06-security-and-public-repo.md §6). */
export function weatherUrl({ lat, lon, timezone }: WeatherParams): string {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone,
    forecast_days: String(WEATHER_DAYS),
  });
  return `${FORECAST_URL}?${query.toString()}`;
}

// Open-Meteo reports missing model values as null.
const value = z.number().nullable();
const values = z.array(value);
const code = z.number().int().min(0).max(99);
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const sameLength = (series: { time: unknown[] } & Record<string, unknown[]>) =>
  Object.values(series).every((list) => list.length === series.time.length);

const responseSchema = z.object({
  current: z.object({
    time: localTime,
    temperature_2m: z.number(),
    apparent_temperature: value,
    weather_code: code,
    is_day: z.union([z.literal(0), z.literal(1)]),
    wind_speed_10m: value,
    precipitation: value,
  }),
  hourly: z
    .object({
      time: z.array(localTime),
      temperature_2m: values,
      precipitation_probability: values,
      weather_code: z.array(code.nullable()),
      is_day: z.array(z.union([z.literal(0), z.literal(1)]).nullable()),
    })
    .refine(sameLength, 'hourly series differ in length'),
  daily: z
    .object({
      time: z.array(localDate),
      weather_code: z.array(code.nullable()),
      temperature_2m_max: values,
      temperature_2m_min: values,
      precipitation_probability_max: values,
    })
    .refine(sameLength, 'daily series differ in length'),
});

export type OpenMeteoForecast = z.input<typeof responseSchema>;

/** Up to `count` indexes from `start` (none when `start` is -1). */
function indexesFrom(start: number, count: number, length: number): number[] {
  if (start === -1) return [];
  return Array.from({ length: Math.min(count, length - start) }, (_, i) => start + i);
}

/** Validates an Open-Meteo forecast response and maps it to the provider-agnostic shape. */
export function mapWeather(raw: unknown): WeatherData {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    // Paths only: the issue list never includes the received values.
    const issue = parsed.error.issues[0];
    throw new ProviderError(`Unexpected forecast response at ${issue?.path.join('.') || '(root)'}`);
  }
  const { current, hourly, daily } = parsed.data;

  // Local ISO strings of the same zone compare correctly as strings.
  const firstHour = hourly.time.findIndex((time) => time > current.time);
  const hourIndexes = indexesFrom(firstHour, WEATHER_HOURS, hourly.time.length);
  const firstDay = daily.time.indexOf(current.time.slice(0, 10));
  const dayIndexes = indexesFrom(firstDay, WEATHER_DAYS, daily.time.length);

  return {
    current: {
      time: current.time,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      code: current.weather_code,
      isDay: current.is_day === 1,
      windSpeed: current.wind_speed_10m,
      precipitation: current.precipitation,
    },
    hourly: hourIndexes.map((i) => ({
      time: hourly.time[i]!,
      temperature: hourly.temperature_2m[i] ?? null,
      precipitationProbability: hourly.precipitation_probability[i] ?? null,
      code: hourly.weather_code[i] ?? null,
      // Unknown day/night: the day icon is the safer default.
      isDay: hourly.is_day[i] !== 0,
    })),
    daily: dayIndexes.map((i) => ({
      date: daily.time[i]!,
      code: daily.weather_code[i] ?? null,
      min: daily.temperature_2m_min[i] ?? null,
      max: daily.temperature_2m_max[i] ?? null,
      precipitationProbability: daily.precipitation_probability_max[i] ?? null,
    })),
  };
}

/** Open-Meteo forecast (docs/05-integrations.md §3): 15 min TTL, stale for up to 3 h. */
export const weatherProvider: Provider<WeatherParams, WeatherData> = {
  name: 'open-meteo-weather',
  ttlSeconds: 15 * 60,
  staleSeconds: 3 * 60 * 60,
  cacheKey: ({ lat, lon, timezone }) => `weather:v1:${lat}:${lon}:${timezone}`,
  fetch: async (params) => mapWeather(await fetchJson(weatherUrl(params))),
};
