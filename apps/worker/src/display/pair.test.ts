import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken, parseTokenRole, sha256Hex } from '../auth/token';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import {
  formatPairingCode,
  generatePairingCode,
  normalizePairingCode,
  PAIRING_ALPHABET,
  PAIRING_CODE_PATTERN,
  PAIRING_MAX_FAILED,
} from './pairing-code';

const ORIGIN = 'https://dashboard.example.com';
const T0 = new Date('2026-01-15T08:00:00.000Z');
// Fictional code used only in tests.
const CODE = 'K7QM2XPA';

let db: DatabaseSync;
let env: Env;

async function insertCode(code: string, over: { expiresAt?: Date; usedAt?: string; failed?: number } = {}) {
  db.prepare(
    `INSERT INTO pairing_codes (code_hash, label, created_at, expires_at, used_at, failed_attempts)
     VALUES (?, 'hall tablet', ?, ?, ?, ?)`,
  ).run(
    await sha256Hex(code),
    T0.toISOString(),
    (over.expiresAt ?? new Date(T0.getTime() + 600_000)).toISOString(),
    over.usedAt ?? null,
    over.failed ?? 0,
  );
}

async function pair(code: string, headers: Record<string, string> = {}): Promise<Response> {
  const req = new Request(`${ORIGIN}/api/v1/display/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ code }),
  });
  return worker.fetch(req, env);
}

async function expectInvalid(res: Response) {
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({
    error: { code: 'invalid_code', message: 'Invalid or expired pairing code' },
  });
}

const deviceTokens = () => db.prepare("SELECT label FROM api_tokens WHERE role = 'device'").all();

describe('pairing code format', () => {
  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePairingCode()).toMatch(PAIRING_CODE_PATTERN);
    }
    expect(PAIRING_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it('normalises what a person types', () => {
    expect(normalizePairingCode(' k7qm-2xpa ')).toBe(CODE);
    expect(formatPairingCode(CODE)).toBe('K7QM-2XPA');
  });
});

describe('POST /api/v1/display/pair', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0, toFake: ['Date'] });
    db = migrate();
    env = { DB: createTestD1(db) } as Env;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a working device token once and consumes the code', async () => {
    await insertCode(CODE);
    const res = await pair('k7qm-2xpa');
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as { token: string };
    expect(parseTokenRole(token)).toBe('device');
    expect(deviceTokens()).toEqual([{ label: 'hall tablet' }]);
    expect(db.prepare('SELECT token_hash FROM api_tokens').get()).toEqual({
      token_hash: await hashToken(token),
    });

    const state = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/display/state`, { headers: { Authorization: `Bearer ${token}` } }),
      env,
    );
    expect(state.status).toBe(200);

    await expectInvalid(await pair(CODE));
    expect(deviceTokens()).toHaveLength(1);
  });

  it('rejects expired and used codes', async () => {
    await insertCode(CODE, { expiresAt: new Date(T0.getTime() - 1) });
    await expectInvalid(await pair(CODE));
    await insertCode('AAAABBBB', { usedAt: T0.toISOString() });
    await expectInvalid(await pair('AAAABBBB'));
    expect(deviceTokens()).toEqual([]);
  });

  it('locks the active code after too many failed attempts', async () => {
    await insertCode(CODE);
    for (let i = 0; i < PAIRING_MAX_FAILED - 1; i++) {
      await expectInvalid(await pair(i % 2 === 0 ? 'ZZZZZZZZ' : 'not a code'));
    }
    expect(db.prepare('SELECT failed_attempts FROM pairing_codes').get()).toEqual({
      failed_attempts: PAIRING_MAX_FAILED - 1,
    });
    await expectInvalid(await pair('YYYYYYYY'));
    await expectInvalid(await pair(CODE));
    expect(deviceTokens()).toEqual([]);
  });

  it('answers the same when there is no code at all', async () => {
    await expectInvalid(await pair(CODE));
  });

  it('rejects malformed bodies and foreign origins', async () => {
    await insertCode(CODE);
    const extra = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/display/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: CODE, role: 'admin' }),
      }),
      env,
    );
    expect(extra.status).toBe(400);
    expect((await pair(CODE, { Origin: 'https://evil.example' })).status).toBe(403);
    expect(deviceTokens()).toEqual([]);
  });
});
