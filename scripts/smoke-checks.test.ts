import { describe, expect, it } from 'vitest';
import { hashToken } from '../apps/worker/src/auth/token.ts';
import type { Env } from '../apps/worker/src/env.ts';
import worker from '../apps/worker/src/index.ts';
import { createTestD1, migrate } from '../apps/worker/src/test/d1.ts';
import { runChecks } from './smoke-checks.ts';

// Fictional tokens; the checks run against the real Worker app with a test D1.
const ADMIN_TOKEN = `dsh_admin_${'B'.repeat(43)}`;
const DEVICE_TOKEN = `dsh_device_${'C'.repeat(43)}`;
const BASE_URL = 'https://dashboard.example.com';

async function setup() {
  const db = migrate();
  const insert = db.prepare(
    'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
  insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  const env = { DB: createTestD1(db) } as Env;
  // Static files are served by Cloudflare before the Worker; emulate the display shell here.
  const fetchImpl = async (input: string, init?: RequestInit) => {
    if (new URL(input).pathname === '/display/') {
      return new Response('<!doctype html>', { headers: { 'Content-Security-Policy': "script-src 'self'" } });
    }
    return worker.fetch(new Request(input, init), env);
  };
  return { db, fetchImpl };
}

describe('runChecks', () => {
  it('passes against the Worker and leaves settings untouched', async () => {
    const { db, fetchImpl } = await setup();
    const checks = await runChecks(
      { baseUrl: BASE_URL, adminToken: ADMIN_TOKEN, deviceToken: DEVICE_TOKEN },
      fetchImpl,
    );

    expect(checks.filter((check) => !check.ok)).toEqual([]);
    expect(checks).toHaveLength(12);
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });

  it('fails when the admin token is not accepted', async () => {
    const { fetchImpl } = await setup();
    const checks = await runChecks(
      { baseUrl: BASE_URL, adminToken: `dsh_admin_${'Z'.repeat(43)}` },
      fetchImpl,
    );
    expect(checks.find((check) => check.name === 'admin reads settings')?.ok).toBe(false);
  });
});
