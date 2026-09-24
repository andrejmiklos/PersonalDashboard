import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import type { Env } from '../env';
import { createTestD1, migrate } from '../test/d1';
import { requireAuth } from './middleware';
import { hashToken } from './token';

// Fictional, well-formed tokens used only in tests.
const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const REVOKED_TOKEN = `dsh_admin_${'C'.repeat(43)}`;
const T0 = new Date('2026-01-15T08:00:00.000Z');

let db: DatabaseSync;
let env: Env;

const app = createApp();
app.get('/admin', requireAuth('admin'), (c) => c.json(c.var.auth));
app.get('/any', requireAuth('admin', 'device'), (c) => c.json(c.var.auth));

async function insertToken(id: string, role: string, token: string, revokedAt: string | null = null) {
  db.prepare(
    'INSERT INTO api_tokens (id, role, label, token_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, role, 'test', await hashToken(token), T0.toISOString(), revokedAt);
}

async function get(path: string, authorization?: string): Promise<Response> {
  const headers: Record<string, string> = authorization ? { Authorization: authorization } : {};
  return app.request(path, { headers }, env);
}

function lastUsed(id: string): unknown {
  return db.prepare('SELECT last_used_at FROM api_tokens WHERE id = ?').get(id)?.last_used_at;
}

async function expectUnauthorized(res: Response) {
  expect(res.status).toBe(401);
  expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
  expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Missing or invalid token' } });
}

describe('requireAuth', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ now: T0 });
    db = migrate();
    env = { DB: createTestD1(db) } as Env;
    await insertToken('tok_admin', 'admin', ADMIN_TOKEN);
    await insertToken('tok_device', 'device', DEVICE_TOKEN);
    await insertToken('tok_revoked', 'admin', REVOKED_TOKEN, T0.toISOString());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a valid token and exposes its id and role', async () => {
    const res = await get('/admin', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tokenId: 'tok_admin', role: 'admin' });
  });

  it('accepts the scheme case-insensitively', async () => {
    expect((await get('/admin', `bearer ${ADMIN_TOKEN}`)).status).toBe(200);
  });

  it('lets both roles through when both are allowed', async () => {
    expect((await get('/any', `Bearer ${ADMIN_TOKEN}`)).status).toBe(200);
    expect((await get('/any', `Bearer ${DEVICE_TOKEN}`)).status).toBe(200);
  });

  it('rejects a device token on an admin route with 403', async () => {
    const res = await get('/admin', `Bearer ${DEVICE_TOKEN}`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: 'forbidden', message: 'Token role not allowed' } });
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', `Basic ${ADMIN_TOKEN}`],
    ['malformed token', 'Bearer dsh_admin_short'],
    ['extra whitespace', `Bearer  ${ADMIN_TOKEN}`],
    ['unknown token', `Bearer dsh_admin_${'Z'.repeat(43)}`],
    ['revoked token', `Bearer ${REVOKED_TOKEN}`],
  ])('rejects %s with an indistinguishable 401', async (_name, header) => {
    await expectUnauthorized(await get('/admin', header));
  });

  it('rejects a token whose prefix role does not match the stored role', async () => {
    const forged = `dsh_admin_${'D'.repeat(43)}`;
    await insertToken('tok_mismatch', 'device', forged);
    await expectUnauthorized(await get('/any', `Bearer ${forged}`));
  });

  it('updates last_used_at at most once per minute', async () => {
    await get('/admin', `Bearer ${ADMIN_TOKEN}`);
    await vi.waitFor(() => expect(lastUsed('tok_admin')).toBe(T0.toISOString()));

    vi.setSystemTime(new Date(T0.getTime() + 30_000));
    await get('/admin', `Bearer ${ADMIN_TOKEN}`);
    expect(lastUsed('tok_admin')).toBe(T0.toISOString());

    const later = new Date(T0.getTime() + 61_000);
    vi.setSystemTime(later);
    await get('/admin', `Bearer ${ADMIN_TOKEN}`);
    await vi.waitFor(() => expect(lastUsed('tok_admin')).toBe(later.toISOString()));
  });

  it('does not touch last_used_at when the role is not allowed', async () => {
    await get('/admin', `Bearer ${DEVICE_TOKEN}`);
    expect(lastUsed('tok_device')).toBeNull();
  });
});
