import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../env';
import { limitBody, readJson } from '../http/json-body';
import { readSettings, writeSettings } from './repository';
import { settingsPatchSchema } from './schema';

/** `/api/v1/settings` (docs/07-api.md §5), admin only. PUT changes only the fields it contains. */
export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use(requireAuth('admin'));

settingsRoutes.get('/', async (c) => c.json(await readSettings(c.env.DB)));

settingsRoutes.put('/', limitBody(4 * 1024), async (c) => {
  const patch = await readJson(c, settingsPatchSchema);
  await writeSettings(c.env.DB, patch);
  return c.json(await readSettings(c.env.DB));
});
