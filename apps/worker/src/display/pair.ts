import { Hono } from 'hono';
import { z } from 'zod';
import { generateToken, hashToken, sha256Hex } from '../auth/token';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { limitBody, readJson } from '../http/json-body';
import { rateLimit } from '../http/rate-limit';
import { generateId } from '../ids';
import { normalizePairingCode, PAIRING_CODE_PATTERN, PAIRING_MAX_FAILED } from './pairing-code';

const pairSchema = z.strictObject({ code: z.string().max(32) });

/** Same answer for unknown, expired, used, locked and malformed codes. */
function invalidCode(): ApiError {
  return new ApiError(400, 'invalid_code', 'Invalid or expired pairing code');
}

/** Counts a failed attempt against every active code; enough failures lock it. */
async function registerFailure(db: D1Database, now: string): Promise<void> {
  await db
    .prepare(
      'UPDATE pairing_codes SET failed_attempts = failed_attempts + 1 WHERE used_at IS NULL AND expires_at > ?',
    )
    .bind(now)
    .run();
}

/**
 * `POST /api/v1/display/pair` (no token): exchanges a one-time pairing code for a new device token.
 * Checking the code, issuing the token and consuming the code happen in one D1 batch (a transaction),
 * so a code can never yield two tokens.
 */
export const pairRoutes = new Hono<AppEnv>();

pairRoutes.post(
  '/',
  rateLimit((env) => env.PAIR_LIMITER),
  limitBody(256),
  async (c) => {
    const db = c.env.DB;
    const now = new Date().toISOString();
    const { code } = await readJson(c, pairSchema);
    const normalized = normalizePairingCode(code);
    if (!PAIRING_CODE_PATTERN.test(normalized)) {
      await registerFailure(db, now);
      throw invalidCode();
    }

    const codeHash = await sha256Hex(normalized);
    const active = 'code_hash = ? AND used_at IS NULL AND expires_at > ? AND failed_attempts < ?';
    const token = generateToken('device');
    const [issued] = await db.batch<{ id: string }>([
      db
        .prepare(
          `INSERT INTO api_tokens (id, role, label, token_hash, created_at)
         SELECT ?, 'device', label, ?, ? FROM pairing_codes WHERE ${active} RETURNING id`,
        )
        .bind(generateId('tok'), await hashToken(token), now, codeHash, now, PAIRING_MAX_FAILED),
      db
        .prepare(`UPDATE pairing_codes SET used_at = ? WHERE ${active}`)
        .bind(now, codeHash, now, PAIRING_MAX_FAILED),
    ]);

    if (issued?.results.length !== 1) {
      await registerFailure(db, now);
      throw invalidCode();
    }
    return c.json({ token }, 201);
  },
);
