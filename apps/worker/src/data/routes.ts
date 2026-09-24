import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { loadCached } from '../cache/provider-cache';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { weatherProvider } from '../providers/open-meteo/weather';
import { readSettings } from '../settings/repository';

/** `/api/v1/data/*` tile data (docs/07-api.md §3). */
export const dataRoutes = new Hono<AppEnv>();

dataRoutes.use(requireAuth('device', 'admin'));

dataRoutes.get('/weather', async (c) => {
  const { location, timezone } = await readSettings(c.env.DB);
  if (!location) {
    throw new ApiError(409, 'location_not_set', 'Set a location in settings first');
  }
  return c.json(
    await loadCached(c.env.DB, weatherProvider, { lat: location.lat, lon: location.lon, timezone }),
  );
});
