import type { AccountProvider } from '../accounts/repository';
import { sha256Hex } from '../auth/token';
import { randomUrlSafe } from './pkce';

/** An authorisation attempt must be completed within this time. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface OAuthAttempt {
  /** Goes to the provider and comes back on the callback; only its hash is stored. */
  state: string;
  /** PKCE verifier; stays on the server. */
  verifier: string;
}

/** Starts an authorisation attempt and drops attempts that have expired. */
export async function createOAuthState(
  db: D1Database,
  provider: AccountProvider,
  now: Date,
): Promise<OAuthAttempt> {
  const attempt: OAuthAttempt = { state: randomUrlSafe(), verifier: randomUrlSafe() };
  const expiresAt = new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString();
  await db.batch([
    db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now.toISOString()),
    // The `state` column holds the SHA-256 of the state, so a read of D1 cannot forge a callback.
    db
      .prepare('INSERT INTO oauth_states (state, provider, verifier, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256Hex(attempt.state), provider, attempt.verifier, expiresAt),
  ]);
  return attempt;
}

/**
 * Consumes the state of a callback and returns its PKCE verifier, or null when the state is unknown, was
 * issued for another provider, has expired or was used before. The row is deleted by the same statement
 * that reads it, so a state works once even for concurrent requests.
 */
export async function consumeOAuthState(
  db: D1Database,
  provider: AccountProvider,
  state: string,
  now: Date,
): Promise<string | null> {
  if (!STATE_PATTERN.test(state)) return null;
  const row = await db
    .prepare('DELETE FROM oauth_states WHERE state = ? AND provider = ? RETURNING verifier, expires_at')
    .bind(await sha256Hex(state), provider)
    .first<{ verifier: string; expires_at: string }>();
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
  return row.verifier;
}
