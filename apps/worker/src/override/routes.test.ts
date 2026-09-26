import type { DatabaseSync } from 'node:sqlite';
import type { DisplayState, LayoutDocument } from '@dashboard/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';

const ORIGIN = 'https://dashboard.example.com';

let db: DatabaseSync;
let env: Env;

async function call(method: string, path: string, body?: unknown, token = ADMIN_TOKEN): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(
    new Request(`${ORIGIN}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    }),
    env,
  );
}

async function createLayout(name: string): Promise<LayoutDocument> {
  const res = await call('POST', '/layouts', {
    schemaVersion: 1,
    name,
    grid: { cols: 12, rows: 8, gap: 8 },
    theme: {},
    tiles: [{ id: 'c1', type: 'clock', x: 0, y: 0, w: 4, h: 2, config: {} }],
  });
  expect(res.status).toBe(201);
  return (await res.json()) as LayoutDocument;
}

const state = async () =>
  (await (await call('GET', '/display/state', undefined, DEVICE_TOKEN)).json()) as DisplayState;

beforeEach(async () => {
  db = migrate();
  env = { DB: createTestD1(db) } as unknown as Env;
  await seedTokens(db);
});

describe('/api/v1/override', () => {
  it('is admin only', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const body = method === 'PUT' ? { layoutId: 'lay_aaaaaaaaaaaaaaaa' } : undefined;
      expect((await call(method, '/override', body, DEVICE_TOKEN)).status, method).toBe(403);
    }
  });

  it('starts without an override', async () => {
    const res = await call('GET', '/override');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('pins a layout until it is cleared', async () => {
    const layout = await createLayout('Evening');
    const put = await call('PUT', '/override', { layoutId: layout.id });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ layoutId: layout.id, expiresAt: null });
    expect(await (await call('GET', '/override')).json()).toEqual({ layoutId: layout.id, expiresAt: null });

    expect((await call('DELETE', '/override')).status).toBe(204);
    expect(await (await call('GET', '/override')).json()).toBeNull();
  });

  it('replaces the previous override', async () => {
    const first = await createLayout('First');
    const second = await createLayout('Second');
    await call('PUT', '/override', { layoutId: first.id });
    await call('PUT', '/override', { layoutId: second.id });
    expect(await (await call('GET', '/override')).json()).toEqual({ layoutId: second.id, expiresAt: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM overrides').get()).toEqual({ n: 1 });
  });

  it('ends after durationSec', async () => {
    const layout = await createLayout('Evening');
    const before = Date.now();
    const put = (await (
      await call('PUT', '/override', { layoutId: layout.id, durationSec: 3600 })
    ).json()) as {
      expiresAt: string;
    };
    const ends = Date.parse(put.expiresAt);
    expect(ends).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(ends).toBeLessThan(Date.now() + 3_600_000 + 1);
  });

  it('accepts a future expiresAt and normalises it to UTC', async () => {
    const layout = await createLayout('Evening');
    const at = new Date(Date.now() + 2 * 3_600_000);
    const put = await call('PUT', '/override', { layoutId: layout.id, expiresAt: at.toISOString() });
    expect(((await put.json()) as { expiresAt: string }).expiresAt).toBe(at.toISOString());
  });

  it('reads an expired override as none', async () => {
    const layout = await createLayout('Evening');
    await call('PUT', '/override', { layoutId: layout.id, durationSec: 60 });
    db.prepare('UPDATE overrides SET expires_at = ? WHERE id = 1').run(
      new Date(Date.now() - 1000).toISOString(),
    );
    expect(await (await call('GET', '/override')).json()).toBeNull();
  });

  it.each([
    ['an unknown layout', { layoutId: 'lay_aaaaaaaaaaaaaaaa' }, 'layoutId: unknown layout'],
    ['a malformed layout id', { layoutId: 'nope' }, 'layoutId'],
    ['both durationSec and expiresAt', { durationSec: 600, expiresAt: '2099-01-01T00:00:00Z' }, 'expiresAt'],
    ['a duration below a minute', { durationSec: 30 }, 'durationSec'],
    ['a duration above 30 days', { durationSec: 31 * 24 * 3600 }, 'durationSec'],
    ['an expiry in the past', { expiresAt: '2020-01-01T00:00:00Z' }, 'expiresAt: must be in the future'],
    ['an expiry that is no date', { expiresAt: 'tomorrow' }, 'expiresAt'],
    ['a screen override, which is not built yet', { screen: 'off' }, 'screen'],
  ])('refuses %s', async (_name, extra, message) => {
    const layout = await createLayout('Evening');
    const body = 'layoutId' in extra ? extra : { layoutId: layout.id, ...extra };
    const res = await call('PUT', '/override', body);
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    expect(error.code).toBe('validation_error');
    expect(error.message).toContain(message);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/override`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'text/plain' },
        body: 'x',
      }),
      env,
    );
    expect(res.status).toBe(415);
  });

  it('keeps a pinned layout from being deleted', async () => {
    const layout = await createLayout('Evening');
    await call('PUT', '/override', { layoutId: layout.id });
    const res = await call('DELETE', `/layouts/${layout.id}`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('layout_in_use');
    await call('DELETE', '/override');
    expect((await call('DELETE', `/layouts/${layout.id}`)).status).toBe(204);
  });
});

describe('display state with an override', () => {
  it('shows the pinned layout instead of the default one', async () => {
    const standard = await createLayout('Standard');
    const evening = await createLayout('Evening');
    await call('PUT', '/settings', { defaultLayoutId: standard.id });
    expect((await state()).layoutSpec).toEqual({ kind: 'layout', layoutId: standard.id });

    await call('PUT', '/override', { layoutId: evening.id });
    const pinned = await state();
    expect(pinned.layoutSpec).toEqual({ kind: 'pinned', layoutId: evening.id });
    expect(Object.keys(pinned.layouts)).toEqual([evening.id]);
  });

  it('works without a default layout', async () => {
    const evening = await createLayout('Evening');
    expect((await state()).layoutSpec).toBeNull();
    await call('PUT', '/override', { layoutId: evening.id });
    expect((await state()).layoutSpec).toEqual({ kind: 'pinned', layoutId: evening.id });
  });

  it('goes back to the default layout when the override is cleared or has expired', async () => {
    const standard = await createLayout('Standard');
    const evening = await createLayout('Evening');
    await call('PUT', '/settings', { defaultLayoutId: standard.id });

    await call('PUT', '/override', { layoutId: evening.id });
    await call('DELETE', '/override');
    expect((await state()).layoutSpec).toEqual({ kind: 'layout', layoutId: standard.id });

    await call('PUT', '/override', { layoutId: evening.id, durationSec: 60 });
    db.prepare('UPDATE overrides SET expires_at = ? WHERE id = 1').run(
      new Date(Date.now() - 1000).toISOString(),
    );
    expect((await state()).layoutSpec).toEqual({ kind: 'layout', layoutId: standard.id });
  });

  it('serves the new version of the pinned layout right after a save, with a new ETag', async () => {
    const layout = await createLayout('Evening');
    await call('PUT', '/override', { layoutId: layout.id });
    const first = await call('GET', '/display/state', undefined, DEVICE_TOKEN);
    const etag = first.headers.get('ETag') ?? '';
    expect(etag).not.toBe('');

    const saved = await call('PUT', `/layouts/${layout.id}`, {
      schemaVersion: 1,
      name: 'Evening, edited',
      grid: { cols: 12, rows: 8, gap: 8 },
      theme: {},
      tiles: [],
    });
    expect(saved.status).toBe(200);
    const second = await call('GET', '/display/state', undefined, DEVICE_TOKEN);
    expect(second.headers.get('ETag')).not.toBe(etag);
    expect(((await second.json()) as DisplayState).layouts[layout.id]?.name).toBe('Evening, edited');
  });
});
