import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { limitBody, readJson } from '../http/json-body';
import { readSettings, writeSettings } from './repository';
import { settingsPatchSchema } from './schema';

/** `/api/v1/settings` (docs/07-api.md §5), admin only. PUT changes only the fields it contains. */
export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use(requireAuth('admin'));

settingsRoutes.get('/', async (c) => c.json(await readSettings(c.env.DB)));

settingsRoutes.put('/', limitBody(4 * 1024), async (c) => {
  const patch = await readJson(c, settingsPatchSchema);
  if (patch.defaultLayoutId) {
    const exists = await c.env.DB.prepare('SELECT 1 FROM layouts WHERE id = ?')
      .bind(patch.defaultLayoutId)
      .first();
    if (!exists) {
      throw new ApiError(400, 'validation_error', 'defaultLayoutId: unknown layout');
    }
  }
  await writeSettings(c.env.DB, patch);
  return c.json(await readSettings(c.env.DB));
});
