import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { limitBody, readJson } from '../http/json-body';
import { LAYOUT_ID_PATTERN } from '../ids';
import { clearOverride, readOverride, writeOverride } from './repository';

const MIN_DURATION_SEC = 60;
const MAX_DURATION_SEC = 30 * 24 * 3600;

/** `layoutId` and, optionally, when it ends: in `durationSec` seconds or at `expiresAt`. Not both. */
const putSchema = z
  .strictObject({
    layoutId: z.string().regex(LAYOUT_ID_PATTERN, 'Invalid layout id'),
    durationSec: z.int().min(MIN_DURATION_SEC).max(MAX_DURATION_SEC).optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((body) => body.durationSec === undefined || body.expiresAt === undefined, {
    message: 'Give durationSec or expiresAt, not both',
    path: ['expiresAt'],
  });

/** `/api/v1/override` (docs/07-api.md §5), admin only. Phase 4 pins a layout; the screen override is Phase 5. */
export const overrideRoutes = new Hono<AppEnv>();

overrideRoutes.use(requireAuth('admin'));

overrideRoutes.get('/', async (c) => c.json(await readOverride(c.env.DB, new Date())));

overrideRoutes.put('/', limitBody(1024), async (c) => {
  const body = await readJson(c, putSchema);
  const now = new Date();
  let expiresAt: string | null = null;
  if (body.durationSec !== undefined) {
    expiresAt = new Date(now.getTime() + body.durationSec * 1000).toISOString();
  } else if (body.expiresAt !== undefined) {
    const at = new Date(body.expiresAt);
    if (at.getTime() <= now.getTime()) {
      throw new ApiError(400, 'validation_error', 'expiresAt: must be in the future');
    }
    expiresAt = at.toISOString();
  }
  const exists = await c.env.DB.prepare('SELECT 1 FROM layouts WHERE id = ?').bind(body.layoutId).first();
  if (!exists) throw new ApiError(400, 'validation_error', 'layoutId: unknown layout');

  const override = { layoutId: body.layoutId, expiresAt };
  await writeOverride(c.env.DB, override);
  return c.json(override);
});

overrideRoutes.delete('/', async (c) => {
  await clearOverride(c.env.DB);
  return c.body(null, 204);
});
