import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../auth/token';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';

// Fictional, well-formed tokens and a fictional location used only in tests.
const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const ORIGIN = 'https://dashboard.example.com';
const DEFAULTS = {
  locale: 'sk',
  timezone: 'Europe/Bratislava',
  location: null,
  powerMode: 'always_on',
  defaultLayoutId: null,
};

let db: DatabaseSync;
let env: Env;

async function request(
  method: string,
  init: { token?: string; body?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['Content-Type'] ??= 'application/json';
  const req = new Request(`${ORIGIN}/api/v1/settings`, { method, headers, body: init.body ?? null });
  return worker.fetch(req, env);
}

function put(body: unknown, headers?: Record<string, string>) {
  return request('PUT', { token: ADMIN_TOKEN, body: JSON.stringify(body), ...(headers ? { headers } : {}) });
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
}

describe('settings API', () => {
  beforeEach(async () => {
    db = migrate();
    env = { DB: createTestD1(db) } as Env;
    const insert = db.prepare(
      'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
    insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  });

  it('returns defaults when nothing is stored', async () => {
    const res = await request('GET', { token: ADMIN_TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
  });

  it('is admin only', async () => {
    await expectError(await request('GET'), 401, 'unauthorized');
    await expectError(await request('GET', { token: DEVICE_TOKEN }), 403, 'forbidden');
    await expectError(
      await request('PUT', { token: DEVICE_TOKEN, body: '{"locale":"en"}' }),
      403,
      'forbidden',
    );
  });

  it('changes only the given fields and persists them', async () => {
    const res = await put({ locale: 'en', powerMode: 'scheduled' });
    expect(res.status).toBe(200);
    const expected = { ...DEFAULTS, locale: 'en', powerMode: 'scheduled' };
    expect(await res.json()).toEqual(expected);

    await put({ timezone: 'Europe/Prague' });
    expect(await (await request('GET', { token: ADMIN_TOKEN })).json()).toEqual({
      ...expected,
      timezone: 'Europe/Prague',
    });
  });

  it('rounds coordinates to two decimals and allows clearing the location', async () => {
    const res = await put({ location: { label: '  Example Town ', lat: 12.345678, lon: -45.678901 } });
    expect(((await res.json()) as { location: unknown }).location).toEqual({
      label: 'Example Town',
      lat: 12.35,
      lon: -45.68,
    });
    expect(db.prepare("SELECT value FROM settings WHERE key = 'location'").get()).toEqual({
      value: '{"label":"Example Town","lat":12.35,"lon":-45.68}',
    });

    const cleared = await put({ location: null });
    expect(((await cleared.json()) as { location: unknown }).location).toBeNull();
  });

  it.each([
    ['empty patch', {}],
    ['unknown field', { locale: 'en', theme: 'dark' }],
    ['unknown locale', { locale: 'de' }],
    ['unknown time zone', { timezone: 'Mars/Olympus' }],
    ['latitude out of range', { location: { label: 'x', lat: 91, lon: 0 } }],
    ['extra location field', { location: { label: 'x', lat: 0, lon: 0, street: 'y' } }],
    ['empty label', { location: { label: '   ', lat: 0, lon: 0 } }],
    ['string coordinate', { location: { label: 'x', lat: '1', lon: 0 } }],
    ['unknown power mode', { powerMode: 'off' }],
    ['array body', [{ locale: 'en' }]],
  ])('rejects %s', async (_name, body) => {
    await expectError(await put(body), 400, 'validation_error');
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });

  it('rejects malformed JSON, wrong content type and oversized bodies', async () => {
    await expectError(await request('PUT', { token: ADMIN_TOKEN, body: '{"locale":' }), 400, 'bad_request');
    await expectError(
      await request('PUT', { token: ADMIN_TOKEN, body: '{}', headers: { 'Content-Type': 'text/plain' } }),
      415,
      'unsupported_media_type',
    );
    const big = JSON.stringify({ location: { label: 'x'.repeat(5000), lat: 0, lon: 0 } });
    await expectError(await request('PUT', { token: ADMIN_TOKEN, body: big }), 413, 'payload_too_large');
  });

  it('rejects state changes from another origin but allows its own', async () => {
    await expectError(
      await put({ locale: 'en' }, { Origin: 'https://evil.example' }),
      403,
      'forbidden_origin',
    );
    expect((await put({ locale: 'en' }, { Origin: ORIGIN })).status).toBe(200);
  });

  it('falls back to the default when a stored value is invalid', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('locale', '\"de\"'), ('timezone', 'not json')",
    ).run();
    expect(await (await request('GET', { token: ADMIN_TOKEN })).json()).toEqual(DEFAULTS);
    vi.restoreAllMocks();
  });
});
