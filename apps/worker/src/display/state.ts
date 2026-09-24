import type { LayoutDocument, Locale } from '@dashboard/shared';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { sha256Hex } from '../auth/token';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { getLayout } from '../layouts/repository';
import { readSettings } from '../settings/repository';

/** Response of `GET /api/v1/display/state` (docs/07-api.md §2). */
export interface DisplayState {
  serverTime: string;
  appVersion: string;
  screen: 'on' | 'off';
  layoutSpec: { kind: 'layout'; layoutId: string } | null;
  layouts: Record<string, LayoutDocument>;
  rotation: null;
  touch: { enabled: boolean; cycle: string[]; timeoutSec: number };
  locale: Locale;
  timezone: string;
  power: { mode: 'always_on' | 'scheduled' | 'manual' };
}

async function loadDefaultLayout(db: D1Database, id: string | null): Promise<LayoutDocument | null> {
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
 * Phase 2: the configured default layout only; schedule, overrides, rotation and power
 * resolution come in Phase 5 (docs/04-layouts-and-editor.md §3.3).
 */
export const displayRoutes = new Hono<AppEnv>();

displayRoutes.get('/state', requireAuth('device', 'admin'), async (c) => {
  const settings = await readSettings(c.env.DB);
  const layout = await loadDefaultLayout(c.env.DB, settings.defaultLayoutId);

  const state: Omit<DisplayState, 'serverTime'> = {
    appVersion: c.env.APP_VERSION ?? 'dev',
    screen: 'on',
    layoutSpec: layout ? { kind: 'layout', layoutId: layout.id } : null,
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
