import { readdirSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { LayoutDocument } from '@dashboard/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../auth/token';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';

// Fictional tokens and ids used only in tests.
const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const ORIGIN = 'https://dashboard.example.com';
const CAL_SOURCE = 'src_aaaaaaaaaaaaaaaa';
const LIST_SOURCE = 'src_bbbbbbbbbbbbbbbb';
const DISABLED_SOURCE = 'src_cccccccccccccccc';
const EXAMPLES_DIR = new URL('../../../../examples/', import.meta.url);

let db: DatabaseSync;
let env: Env;

async function call(method: string, path: string, body?: unknown, token = ADMIN_TOKEN): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return worker.fetch(new Request(`${ORIGIN}/api/v1/layouts${path}`, init), env);
}

async function errorOf(res: Response): Promise<{ status: number; code: string; message: string }> {
  const { error } = (await res.json()) as { error: { code: string; message: string } };
  return { status: res.status, ...error };
}

function layout(tiles: unknown[], extra: Record<string, unknown> = {}) {
  return { schemaVersion: 1, name: 'Test', grid: { cols: 12, rows: 8, gap: 8 }, theme: {}, tiles, ...extra };
}

const clock = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 4,
  h: 2,
  config: {},
  ...over,
});

async function create(body: unknown = layout([clock()])): Promise<LayoutDocument> {
  const res = await call('POST', '', body);
  expect(res.status).toBe(201);
  return (await res.json()) as LayoutDocument;
}

beforeEach(async () => {
  db = migrate();
  env = { DB: createTestD1(db) } as Env;
  const insert = db.prepare(
    'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
  insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  db.exec(`INSERT INTO accounts (id, provider, external_id, refresh_token_enc, scopes, created_at, updated_at)
           VALUES ('acc_1', 'google', 'ext', 'enc', 'scope', 'now', 'now')`);
  db.exec(`INSERT INTO sources (id, account_id, kind, remote_id, label, enabled) VALUES
           ('${CAL_SOURCE}', 'acc_1', 'calendar', 'r1', 'Cal', 1),
           ('${LIST_SOURCE}', 'acc_1', 'task_list', 'r2', 'List', 1),
           ('${DISABLED_SOURCE}', 'acc_1', 'calendar', 'r3', 'Off', 0)`);
});

describe('layouts CRUD', () => {
  it('is admin only', async () => {
    expect((await call('GET', '', undefined, DEVICE_TOKEN)).status).toBe(403);
    expect((await call('POST', '', layout([]), DEVICE_TOKEN)).status).toBe(403);
  });

  it('creates a layout with server-owned id and version and filled defaults', async () => {
    const doc = await create();
    expect(doc.id).toMatch(/^lay_[a-z2-7]{16}$/);
    expect(doc.version).toBe(1);
    expect(doc.tiles[0]?.config).toEqual({
      format: '24h',
      showSeconds: false,
      showDate: true,
      dateStyle: 'long',
      showWeekNumber: false,
    });
    expect(await (await call('GET', `/${doc.id}`)).json()).toEqual(doc);
  });

  it('lists summaries', async () => {
    const doc = await create();
    expect(await (await call('GET', '')).json()).toEqual([
      { id: doc.id, name: 'Test', version: 1, updatedAt: expect.any(String), tileCount: 1 },
    ]);
  });

  it('replaces a layout and bumps the version', async () => {
    const doc = await create();
    const res = await call('PUT', `/${doc.id}`, layout([clock({ w: 6 })], { name: 'Renamed' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: doc.id, name: 'Renamed', version: 2, tiles: [{ w: 6 }] });
  });

  it('rejects a stale ifVersion without changing the layout', async () => {
    const doc = await create();
    expect((await call('PUT', `/${doc.id}`, { ...layout([clock()]), ifVersion: 1 })).status).toBe(200);
    const conflict = await call('PUT', `/${doc.id}`, { ...layout([clock({ w: 8 })]), ifVersion: 1 });
    expect(await errorOf(conflict)).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(await (await call('GET', `/${doc.id}`)).json()).toMatchObject({ version: 2, tiles: [{ w: 4 }] });
  });

  it('duplicates a layout', async () => {
    const doc = await create();
    const res = await call('POST', `/${doc.id}/duplicate`);
    expect(res.status).toBe(201);
    const copy = (await res.json()) as LayoutDocument;
    expect(copy).toMatchObject({ name: 'Test (copy)', version: 1, tiles: doc.tiles });
    expect(copy.id).not.toBe(doc.id);
  });

  it('deletes an unused layout and refuses one in use', async () => {
    const unused = await create();
    expect((await call('DELETE', `/${unused.id}`)).status).toBe(204);
    expect((await call('GET', `/${unused.id}`)).status).toBe(404);

    const used = await create();
    db.prepare(
      "INSERT INTO schedule_rules (id, layout_id, days, from_min, to_min) VALUES ('r1', ?, 127, 0, 60)",
    ).run(used.id);
    expect(await errorOf(await call('DELETE', `/${used.id}`))).toMatchObject({
      status: 409,
      code: 'layout_in_use',
    });
    expect((await call('GET', `/${used.id}`)).status).toBe(200);
  });

  it.each([
    ['GET', '/lay_missingmissingmi'],
    ['GET', "/lay_x' OR 1=1 --"],
    ['PUT', '/not-an-id'],
    ['DELETE', '/lay_aaaaaaaaaaaaaaaa'],
    ['POST', '/lay_aaaaaaaaaaaaaaaa/duplicate'],
  ])('%s %s -> 404', async (method, path) => {
    const body = method === 'PUT' ? layout([clock()]) : undefined;
    expect(await errorOf(await call(method, path, body))).toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('layout validation', () => {
  const calendar = (sourceIds: string[]) => ({
    id: 'cal',
    type: 'calendar',
    x: 4,
    y: 0,
    w: 5,
    h: 6,
    config: { sourceIds },
  });

  it('accepts sources of the right kind', async () => {
    const doc = await create(layout([clock(), calendar([CAL_SOURCE])]));
    expect(doc.tiles[1]?.config['sourceIds']).toEqual([CAL_SOURCE]);
  });

  it.each([
    ['wrong schema version', layout([], { schemaVersion: 2 })],
    ['unknown top-level key', layout([], { owner: 'x' })],
    ['empty name', layout([], { name: '  ' })],
    ['wrong grid', layout([], { grid: { cols: 10, rows: 8, gap: 8 } })],
    ['bad accent', layout([], { theme: { accent: 'red' } })],
    ['too many tiles', layout(Array.from({ length: 25 }, (_, i) => clock({ id: `t${i}`, x: 0, y: 0 })))],
    ['unknown tile type', layout([clock({ type: 'camera' })])],
    ['bad tile id', layout([clock({ id: 'a b' })])],
    ['fractional position', layout([clock({ x: 0.5 })])],
    ['outside the grid', layout([clock({ x: 10 })])],
    ['below minimum size', layout([clock({ w: 1 })])],
    ['duplicate tile id', layout([clock(), clock({ x: 6 })])],
    ['overlap', layout([clock(), clock({ id: 'c2', x: 3 })])],
    ['unknown config key', layout([clock({ config: { color: 'red' } })])],
    ['config out of range', layout([{ ...clock(), type: 'weather', w: 4, h: 4, config: { dailyDays: 9 } }])],
    [
      'missing countdown label',
      layout([{ ...clock(), type: 'countdown', config: { target: '2027-07-01' } }]),
    ],
    [
      'impossible countdown date',
      layout([{ ...clock(), type: 'countdown', config: { label: 'x', target: '2027-02-30' } }]),
    ],
    ['calendar without sources', layout([calendar([])])],
    ['unknown source', layout([calendar(['src_zzzzzzzzzzzzzzzz'])])],
    ['disabled source', layout([calendar([DISABLED_SOURCE])])],
    ['source of the wrong kind', layout([calendar([LIST_SOURCE])])],
    ['duplicate source', layout([calendar([CAL_SOURCE, CAL_SOURCE])])],
  ])('rejects %s', async (_name, body) => {
    expect(await errorOf(await call('POST', '', body))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM layouts').get()).toEqual({ n: 0 });
  });

  it('accepts countdown targets with and without time', async () => {
    for (const target of ['2027-07-01', '2027-07-01T18:30']) {
      await create(layout([{ ...clock(), type: 'countdown', config: { label: 'Trip', target } }]));
    }
  });

  it('rejects bodies over 64 KB', async () => {
    const big = JSON.stringify(layout([], { name: 'x'.repeat(70_000) }));
    expect(await errorOf(await call('POST', '', big))).toMatchObject({ status: 413 });
  });

  it.each(readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.json')))(
    'accepts examples/%s',
    async (file) => {
      await create(JSON.parse(readFileSync(new URL(file, EXAMPLES_DIR), 'utf8')));
    },
  );
});
