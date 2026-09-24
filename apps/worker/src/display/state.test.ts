import type { DatabaseSync } from 'node:sqlite';
import type { DisplayState, LayoutDocument } from '@dashboard/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';
import { resetAppVersionCache } from './state';

const ORIGIN = 'https://dashboard.example.com';

let db: DatabaseSync;
let env: Env;

async function call(
  method: string,
  path: string,
  init: { token?: string; body?: unknown; etag?: string } = {},
) {
  const headers: Record<string, string> = { Authorization: `Bearer ${init.token ?? ADMIN_TOKEN}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.etag !== undefined) headers['If-None-Match'] = init.etag;
  const req = new Request(`${ORIGIN}/api/v1${path}`, {
    method,
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  return worker.fetch(req, env);
}

const getState = (etag?: string) =>
  call('GET', '/display/state', { token: DEVICE_TOKEN, ...(etag ? { etag } : {}) });

function clockLayout(w = 4) {
  return {
    schemaVersion: 1,
    name: 'Clock',
    grid: { cols: 12, rows: 8, gap: 8 },
    theme: {},
    tiles: [{ id: 'c1', type: 'clock', x: 0, y: 0, w, h: 2, config: {} }],
  };
}

async function createDefaultLayout(): Promise<LayoutDocument> {
  const layout = (await (await call('POST', '/layouts', { body: clockLayout() })).json()) as LayoutDocument;
  expect((await call('PUT', '/settings', { body: { defaultLayoutId: layout.id } })).status).toBe(200);
  return layout;
}

describe('GET /api/v1/display/state', () => {
  beforeEach(async () => {
    db = migrate();
    resetAppVersionCache();
    const assets = {
      fetch: async (url: string) =>
        new URL(url).pathname === '/display/version.json'
          ? Response.json({ version: 'test-build' })
          : new Response('', { status: 404 }),
    };
    env = { DB: createTestD1(db), ASSETS: assets } as unknown as Env;
    await seedTokens(db);
  });

  it('requires a token', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/v1/display/state`), env);
    expect(res.status).toBe(401);
  });

  it('reports no layout until a default is set', async () => {
    const res = await getState();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      serverTime: expect.any(String),
      appVersion: 'test-build',
      screen: 'on',
      layoutSpec: null,
      layouts: {},
      rotation: null,
      touch: { enabled: false, cycle: [], timeoutSec: 0 },
      locale: 'sk',
      timezone: 'Europe/Bratislava',
      power: { mode: 'always_on' },
    });
  });

  it('reports the development version when version.json is missing', async () => {
    env = { DB: env.DB } as Env;
    const state = (await (await getState()).json()) as DisplayState;
    expect(state.appVersion).toBe('dev');
  });

  it('embeds the default layout', async () => {
    const layout = await createDefaultLayout();
    const state = (await (await getState()).json()) as DisplayState;
    expect(state.layoutSpec).toEqual({ kind: 'layout', layoutId: layout.id });
    expect(state.layouts).toEqual({ [layout.id]: layout });
  });

  it('answers 304 for a matching ETag and changes it when the layout changes', async () => {
    const layout = await createDefaultLayout();
    const etag = (await getState()).headers.get('ETag');
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);

    const notModified = await getState(etag!);
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe('');
    expect((await getState(`W/${etag}, "other"`)).status).toBe(304);

    await call('PUT', `/layouts/${layout.id}`, { body: clockLayout(6) });
    const changed = await getState(etag!);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(etag);
  });

  it('falls back to no layout when the default disappeared', async () => {
    await createDefaultLayout();
    db.exec('DELETE FROM layouts');
    expect(((await (await getState()).json()) as DisplayState).layoutSpec).toBeNull();
  });

  it('refuses unknown default layouts and deleting the default', async () => {
    const unknown = await call('PUT', '/settings', { body: { defaultLayoutId: 'lay_aaaaaaaaaaaaaaaa' } });
    expect(unknown.status).toBe(400);

    const layout = await createDefaultLayout();
    const del = await call('DELETE', `/layouts/${layout.id}`);
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({
      error: { code: 'layout_in_use', message: 'Layout is used by the default layout setting' },
    });

    await call('PUT', '/settings', { body: { defaultLayoutId: null } });
    expect((await call('DELETE', `/layouts/${layout.id}`)).status).toBe(204);
  });
});
