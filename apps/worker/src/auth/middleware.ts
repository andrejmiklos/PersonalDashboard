import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { hashToken, parseTokenRole, timingSafeEqual, type Role } from './token';

export interface AuthInfo {
  tokenId: string;
  role: Role;
}

interface TokenRow {
  id: string;
  role: string;
  token_hash: string;
  last_used_at: string | null;
}

const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Resolves the bearer token to its D1 row. Every failure returns null so callers
 * cannot tell a malformed, unknown or revoked token apart.
 */
async function authenticate(db: D1Database, header: string | undefined): Promise<TokenRow | null> {
  const match = /^Bearer (\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  const role = token === undefined ? null : parseTokenRole(token);
  if (token === undefined || role === null) {
    return null;
  }

  const hash = await hashToken(token);
  const row = await db
    .prepare(
      'SELECT id, role, token_hash, last_used_at FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL',
    )
    .bind(hash)
    .first<TokenRow>();
  if (!row || !timingSafeEqual(row.token_hash, hash) || row.role !== role) {
    return null;
  }
  return row;
}

function touchLastUsed(c: Context<AppEnv>, row: TokenRow): void {
  const now = Date.now();
  if (row.last_used_at !== null && now - Date.parse(row.last_used_at) < LAST_USED_THROTTLE_MS) {
    return;
  }
  const update = c.env.DB.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?')
    .bind(new Date(now).toISOString(), row.id)
    .run()
    .then(
      () => undefined,
      (err: unknown) =>
        console.error(`last_used_at update failed: ${err instanceof Error ? err.name : 'unknown'}`),
    );
  try {
    c.executionCtx.waitUntil(update);
  } catch {
    // No execution context outside the Workers runtime (tests); the promise still settles.
  }
}

/** Requires a valid bearer token of one of the given roles and exposes it as `c.var.auth`. */
export function requireAuth(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const row = await authenticate(c.env.DB, c.req.header('Authorization'));
    if (!row) {
      c.header('WWW-Authenticate', 'Bearer');
      throw new ApiError(401, 'unauthorized', 'Missing or invalid token');
    }
    const auth: AuthInfo = { tokenId: row.id, role: row.role as Role };
    if (!roles.includes(auth.role)) {
      throw new ApiError(403, 'forbidden', 'Token role not allowed');
    }
    touchLastUsed(c, row);
    c.set('auth', auth);
    await next();
  };
}
