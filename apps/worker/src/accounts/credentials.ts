import { ApiError } from '../errors';
import type { SecretBox } from '../crypto/secret-box';

/** Sealed values are bound to their account and purpose (see SecretBox). */
export function refreshTokenContext(accountId: string): string {
  return `refresh:${accountId}`;
}

function accessTokenContext(accountId: string): string {
  return `access:${accountId}`;
}

/** An access token is not used within this margin of its expiry. */
const EXPIRY_MARGIN_MS = 60_000;

/** Reads and decrypts the refresh token of an account. */
export async function loadRefreshToken(db: D1Database, box: SecretBox, accountId: string): Promise<string> {
  const row = await db
    .prepare('SELECT refresh_token_enc FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<{ refresh_token_enc: string }>();
  if (!row) throw new ApiError(404, 'not_found', 'Account not found');
  return box.open(row.refresh_token_enc, refreshTokenContext(accountId));
}

/** Stores a rotated refresh token at once, so the next refresh never spends a used one. */
export async function saveRefreshToken(
  db: D1Database,
  box: SecretBox,
  accountId: string,
  refreshToken: string,
  now: Date,
): Promise<void> {
  await db
    .prepare('UPDATE accounts SET refresh_token_enc = ?, updated_at = ? WHERE id = ?')
    .bind(await box.seal(refreshToken, refreshTokenContext(accountId)), now.toISOString(), accountId)
    .run();
}

/** The cached access token while it is still valid for at least a minute, otherwise null. */
export async function loadAccessToken(
  db: D1Database,
  box: SecretBox,
  accountId: string,
  now: Date,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT access_token_enc, access_expires_at FROM accounts WHERE id = ?')
    .bind(accountId)
    .first<{ access_token_enc: string | null; access_expires_at: string | null }>();
  if (!row?.access_token_enc || !row.access_expires_at) return null;
  if (Date.parse(row.access_expires_at) - now.getTime() < EXPIRY_MARGIN_MS) return null;
  return box.open(row.access_token_enc, accessTokenContext(accountId));
}

export async function saveAccessToken(
  db: D1Database,
  box: SecretBox,
  accountId: string,
  accessToken: string,
  expiresAt: Date,
): Promise<void> {
  await db
    .prepare('UPDATE accounts SET access_token_enc = ?, access_expires_at = ? WHERE id = ?')
    .bind(await box.seal(accessToken, accessTokenContext(accountId)), expiresAt.toISOString(), accountId)
    .run();
}

/** Marks the account as needing a new consent and drops its cached access token. */
export async function markReauthRequired(db: D1Database, accountId: string, now: Date): Promise<void> {
  await db
    .prepare(
      `UPDATE accounts SET status = 'reauth_required', access_token_enc = NULL, access_expires_at = NULL,
         updated_at = ? WHERE id = ?`,
    )
    .bind(now.toISOString(), accountId)
    .run();
}

/**
 * Takes the refresh lock of an account for `ttlMs`; false when another request holds it.
 * A single conditional UPDATE, so D1's serialised writes make it atomic. The lock expires by itself
 * if the holder dies.
 */
export async function tryAcquireRefreshLock(
  db: D1Database,
  accountId: string,
  now: Date,
  ttlMs: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE accounts SET refresh_lock_until = ?
       WHERE id = ? AND (refresh_lock_until IS NULL OR refresh_lock_until <= ?) RETURNING id`,
    )
    .bind(new Date(now.getTime() + ttlMs).toISOString(), accountId, now.toISOString())
    .first<{ id: string }>();
  return row !== null;
}

export async function releaseRefreshLock(db: D1Database, accountId: string): Promise<void> {
  await db.prepare('UPDATE accounts SET refresh_lock_until = NULL WHERE id = ?').bind(accountId).run();
}
