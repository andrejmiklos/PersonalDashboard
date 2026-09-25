import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware';
import { createSecretBox } from '../crypto/secret-box';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { limitBody, readJson } from '../http/json-body';
import { providerFailure } from '../providers/failure';
import { discoverSources } from './discover';
import {
  deleteAccount,
  getAccount,
  listAccounts,
  listSources,
  updateSource,
  upsertSource,
  type Account,
  type SourceKind,
} from './repository';

const ACCOUNT_ID_PATTERN = /^acc_[a-z2-7]{16}$/;
const SOURCE_ID_PATTERN = /^src_[a-z2-7]{16}$/;
const MAX_BODY_BYTES = 2 * 1024;

/** Colours given to new sources in turn, readable on the dark theme; the owner can change them. */
export const SOURCE_COLORS = [
  '#4f9dff',
  '#ff8a4f',
  '#4fd18b',
  '#e56bd0',
  '#f2c94c',
  '#4fd1d1',
  '#ff6b6b',
  '#a78bfa',
];

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb')
  .transform((value) => value.toLowerCase());
const labelSchema = z.string().trim().min(1).max(80);

const addSourceSchema = z.strictObject({
  remoteId: z.string().min(1).max(256),
  label: labelSchema.optional(),
  color: colorSchema.nullable().optional(),
});

const patchSourceSchema = z.strictObject({
  label: labelSchema.optional(),
  color: colorSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

/** Rejects malformed ids before they reach D1. */
function checkId(pattern: RegExp, what: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!pattern.test(c.req.param('id') ?? '')) {
      throw new ApiError(404, 'not_found', `${what} not found`);
    }
    await next();
  };
}

/** Accounts as the admin sees them: never tokens or scopes. */
function publicAccount(account: Account) {
  return {
    id: account.id,
    provider: account.provider,
    displayName: account.displayName,
    status: account.status,
  };
}

/** `/api/v1/accounts` (docs/07-api.md §6), admin only. */
export const accountRoutes = new Hono<AppEnv>();

accountRoutes.use(requireAuth('admin'));
accountRoutes.use('/:id', checkId(ACCOUNT_ID_PATTERN, 'Account'));
accountRoutes.use('/:id/*', checkId(ACCOUNT_ID_PATTERN, 'Account'));

accountRoutes.get('/', async (c) => c.json((await listAccounts(c.env.DB)).map(publicAccount)));

accountRoutes.delete('/:id', async (c) => {
  await deleteAccount(c.env.DB, c.req.param('id'));
  return c.body(null, 204);
});

/** Remote calendars / lists of the account, each with the id of its source when it was added already. */
accountRoutes.get('/:id/discover', async (c) => {
  const account = await getAccount(c.env.DB, c.req.param('id'));
  const known = await listSources(c.env.DB, { accountId: account.id });
  try {
    const discovered = await discoverSources(c.env, await createSecretBox(c.env.TOKEN_ENC_KEY), account);
    return c.json(
      discovered.map((item) => ({
        ...item,
        sourceId: known.find((s) => s.kind === item.kind && s.remoteId === item.remoteId)?.id ?? null,
      })),
    );
  } catch (err) {
    throw providerFailure(err);
  }
});

/** Adds a discovered calendar / list as a source; adding a known one updates its label and colour. */
accountRoutes.post('/:id/sources', limitBody(MAX_BODY_BYTES), async (c) => {
  const body = await readJson(c, addSourceSchema);
  const account = await getAccount(c.env.DB, c.req.param('id'));

  let discovered;
  try {
    discovered = await discoverSources(c.env, await createSecretBox(c.env.TOKEN_ENC_KEY), account);
  } catch (err) {
    throw providerFailure(err);
  }
  const remote = discovered.find((item) => item.remoteId === body.remoteId);
  if (!remote) throw new ApiError(404, 'not_found', 'The account has no such calendar or list');

  const existing = (await listSources(c.env.DB)).length;
  const source = await upsertSource(c.env.DB, {
    accountId: account.id,
    kind: remote.kind satisfies SourceKind,
    remoteId: remote.remoteId,
    label: body.label ?? remote.label,
    color: body.color === undefined ? (SOURCE_COLORS[existing % SOURCE_COLORS.length] ?? null) : body.color,
  });
  return c.json(source, 201);
});

/** `/api/v1/sources` (docs/07-api.md §6), admin only. */
export const sourceRoutes = new Hono<AppEnv>();

sourceRoutes.use(requireAuth('admin'));
sourceRoutes.use('/:id', checkId(SOURCE_ID_PATTERN, 'Source'));

sourceRoutes.get('/', async (c) => {
  const kind = c.req.query('kind');
  if (kind !== undefined && kind !== 'calendar' && kind !== 'task_list') {
    throw new ApiError(400, 'validation_error', 'kind: expected calendar or task_list');
  }
  return c.json(await listSources(c.env.DB, kind === undefined ? {} : { kind }));
});

sourceRoutes.put('/:id', limitBody(MAX_BODY_BYTES), async (c) => {
  const patch = await readJson(c, patchSourceSchema);
  return c.json(await updateSource(c.env.DB, c.req.param('id'), patch));
});
