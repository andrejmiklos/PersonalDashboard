import { localDateString, type AstroData, type DataEnvelope } from '@dashboard/shared';
import { Hono } from 'hono';
import { computeAstro } from '../astro/compute';
import { requireAuth } from '../auth/middleware';
import { loadCached } from '../cache/provider-cache';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { weatherProvider } from '../providers/open-meteo/weather';
import { readSettings } from '../settings/repository';
import type { Settings } from '../settings/schema';

/** Computed values do not expire on the server; the client refreshes every 6 h and at midnight. */
const ASTRO_TTL_SECONDS = 6 * 60 * 60;

/** `/api/v1/data/*` tile data (docs/07-api.md §3). */
export const dataRoutes = new Hono<AppEnv>();

dataRoutes.use(requireAuth('device', 'admin'));

function requireLocation(settings: Settings): NonNullable<Settings['location']> {
  if (!settings.location) {
    throw new ApiError(409, 'location_not_set', 'Set a location in settings first');
  }
  return settings.location;
}

/** A real calendar date `YYYY-MM-DD` between 1900 and 2199. */
function isCalendarDate(value: string): boolean {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

dataRoutes.get('/weather', async (c) => {
  const settings = await readSettings(c.env.DB);
  const { lat, lon } = requireLocation(settings);
  return c.json(await loadCached(c.env.DB, weatherProvider, { lat, lon, timezone: settings.timezone }));
});

dataRoutes.get('/astro', async (c) => {
  const date = c.req.query('date');
  if (date !== undefined && !isCalendarDate(date)) {
    throw new ApiError(400, 'validation_error', 'date: expected YYYY-MM-DD');
  }
  const settings = await readSettings(c.env.DB);
  const { lat, lon } = requireLocation(settings);
  const day = date ?? localDateString(new Date(), settings.timezone);

  const body: DataEnvelope<AstroData> = {
    updatedAt: new Date().toISOString(),
    ttl: ASTRO_TTL_SECONDS,
    data: computeAstro(day, lat, lon, settings.timezone),
  };
  return c.json(body);
});
