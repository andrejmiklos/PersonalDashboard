import { MAX_LAYOUT_BYTES } from '@dashboard/shared';
import { Hono, type MiddlewareHandler } from 'hono';
import { requireAuth } from '../auth/middleware';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { LAYOUT_ID_PATTERN } from '../ids';
import { limitBody, readJson } from '../http/json-body';
import {
  createLayout,
  deleteLayout,
  duplicateLayout,
  getLayout,
  listLayouts,
  replaceLayout,
} from './repository';
import { layoutInputSchema, layoutPutSchema } from './schema';
import { validateLayout } from './validate';

/** Rejects malformed ids before they reach D1. */
const checkId: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!LAYOUT_ID_PATTERN.test(c.req.param('id') ?? '')) {
    throw new ApiError(404, 'not_found', 'Layout not found');
  }
  await next();
};

/** `/api/v1/layouts` (docs/07-api.md §4), admin only. */
export const layoutRoutes = new Hono<AppEnv>();

layoutRoutes.use(requireAuth('admin'));
layoutRoutes.use('/:id', checkId);
layoutRoutes.use('/:id/*', checkId);

layoutRoutes.get('/', async (c) => c.json(await listLayouts(c.env.DB)));

layoutRoutes.post('/', limitBody(MAX_LAYOUT_BYTES), async (c) => {
  const body = await validateLayout(c.env.DB, await readJson(c, layoutInputSchema));
  return c.json(await createLayout(c.env.DB, body, new Date()), 201);
});

layoutRoutes.get('/:id', async (c) => c.json(await getLayout(c.env.DB, c.req.param('id'))));

layoutRoutes.put('/:id', limitBody(MAX_LAYOUT_BYTES), async (c) => {
  const { ifVersion, ...input } = await readJson(c, layoutPutSchema);
  const body = await validateLayout(c.env.DB, input);
  return c.json(await replaceLayout(c.env.DB, c.req.param('id'), body, new Date(), ifVersion));
});

layoutRoutes.post('/:id/duplicate', async (c) =>
  c.json(await duplicateLayout(c.env.DB, c.req.param('id'), new Date()), 201),
);

layoutRoutes.delete('/:id', async (c) => {
  await deleteLayout(c.env.DB, c.req.param('id'));
  return c.body(null, 204);
});
