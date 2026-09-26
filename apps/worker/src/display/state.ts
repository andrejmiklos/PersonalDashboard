import { DEV_APP_VERSION, type DisplayState, type LayoutDocument } from '@dashboard/shared';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { sha256Hex } from '../auth/token';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { getLayout } from '../layouts/repository';
import { readOverride } from '../override/repository';
import { readSettings } from '../settings/repository';

let cachedVersion: string | undefined;

/**
 * Build id written by the display build to /display/version.json. Assets are immutable within a
 * deployment, so one read per isolate is enough; failures are not cached.
 */
async function readAppVersion(assets: Fetcher | undefined): Promise<string> {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    const res = await assets?.fetch('https://assets.invalid/display/version.json');
    const version = res?.ok ? ((await res.json()) as { version?: unknown }).version : undefined;
    if (typeof version === 'string' && /^[a-z0-9-]{1,64}$/.test(version)) {
      cachedVersion = version;
      return version;
    }
  } catch {
    // Fall through to the development value.
  }
  return DEV_APP_VERSION;
}

/** For tests: forget the cached build id. */
export function resetAppVersionCache(): void {
  cachedVersion = undefined;
}

async function loadLayout(db: D1Database, id: string | null): Promise<LayoutDocument | null> {
  if (id === null) return null;
  try {
    return await getLayout(db, id);
  } catch (err) {
    // Deleted between the settings read and now: show "no layout" rather than failing the poll.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/**
 * The layout pinned by the admin (an override that has not expired), else the configured default. Schedule,
 * rotation and power resolution come in Phase 5 (docs/04-layouts-and-editor.md §3.3).
 */
export const displayRoutes = new Hono<AppEnv>();

displayRoutes.get('/state', requireAuth('device', 'admin'), async (c) => {
  const settings = await readSettings(c.env.DB);
  const override = await readOverride(c.env.DB, new Date());
  const pinned = await loadLayout(c.env.DB, override?.layoutId ?? null);
  const layout = pinned ?? (await loadLayout(c.env.DB, settings.defaultLayoutId));

  const state: Omit<DisplayState, 'serverTime'> = {
    appVersion: await readAppVersion(c.env.ASSETS),
    screen: 'on',
    layoutSpec: layout ? { kind: layout === pinned ? 'pinned' : 'layout', layoutId: layout.id } : null,
    layouts: layout ? { [layout.id]: layout } : {},
    rotation: null,
    touch: { enabled: false, cycle: [], timeoutSec: 0 },
    locale: settings.locale,
    timezone: settings.timezone,
    power: { mode: settings.powerMode },
  };

  // serverTime changes on every call, so it is left out of the ETag.
  const etag = `"${(await sha256Hex(JSON.stringify(state))).slice(0, 32)}"`;
  c.header('ETag', etag);
  if (matchesEtag(c.req.header('If-None-Match'), etag)) {
    return c.body(null, 304);
  }
  const body: DisplayState = { serverTime: new Date().toISOString(), ...state };
  return c.json(body);
});
