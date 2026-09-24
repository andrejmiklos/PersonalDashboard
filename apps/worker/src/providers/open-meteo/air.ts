import type { AirData } from '@dashboard/shared';
import { z } from 'zod';
import { fetchJson, ProviderError, type Provider } from '../types';
import type { WeatherParams } from './weather';

export type AirParams = WeatherParams;

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** Only the rounded coordinates and the time zone leave the Worker (docs/06-security-and-public-repo.md §6). */
export function airUrl({ lat, lon, timezone }: AirParams): string {
  const query = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'european_aqi,pm2_5,pm10',
    timezone,
  });
  return `${AIR_URL}?${query.toString()}`;
}

// Missing model values are null; negative concentrations would be a broken response.
const value = z.number().min(0).nullable();

const responseSchema = z.object({
  current: z.object({
    time: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    european_aqi: value,
    pm2_5: value,
    pm10: value,
  }),
});

export type OpenMeteoAir = z.input<typeof responseSchema>;

/** Validates an Open-Meteo air quality response and maps it to the provider-agnostic shape. */
export function mapAir(raw: unknown): AirData {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    // Paths only: the issue list never includes the received values.
    const issue = parsed.error.issues[0];
    throw new ProviderError(`Unexpected air quality response at ${issue?.path.join('.') || '(root)'}`);
  }
  const { current } = parsed.data;
  return { time: current.time, aqi: current.european_aqi, pm2_5: current.pm2_5, pm10: current.pm10 };
}

/** Open-Meteo air quality (CAMS, docs/05-integrations.md §3): 60 min TTL, stale for up to 3 h. */
export const airProvider: Provider<AirParams, AirData> = {
  name: 'open-meteo-air',
  ttlSeconds: 60 * 60,
  staleSeconds: 3 * 60 * 60,
  cacheKey: ({ lat, lon, timezone }) => `air:v1:${lat}:${lon}:${timezone}`,
  fetch: async (params) => mapAir(await fetchJson(airUrl(params))),
};
