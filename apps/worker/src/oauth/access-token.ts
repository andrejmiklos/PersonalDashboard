import {
  loadAccessToken,
  loadRefreshToken,
  markReauthRequired,
  releaseRefreshLock,
  saveAccessToken,
  saveRefreshToken,
  tryAcquireRefreshLock,
} from '../accounts/credentials';
import { getAccount } from '../accounts/repository';
import type { SecretBox } from '../crypto/secret-box';
import { OAuthError, refreshTokens, type OAuthClientConfig } from './client';

/** The account has no working grant any more; the owner must connect it again (`accounts.status`). */
export class ReauthRequiredError extends Error {
  readonly accountId: string;

  constructor(accountId: string) {
    super('Account needs to be reconnected');
    this.name = 'ReauthRequiredError';
    this.accountId = accountId;
  }
}

const LOCK_TTL_MS = 15_000;
const WAIT_STEP_MS = 250;
const MAX_WAIT_MS = 5_000;

export interface AccessTokenOptions {
  now?: () => Date;
  wait?: (ms: number) => Promise<void>;
}

/**
 * A valid access token of an account: the sealed one from D1, or a fresh one from the refresh token.
 *
 * Refreshes of one account are serialised by a lock row. Microsoft rotates the refresh token on every use,
 * so two requests must not spend the same one; the request that loses the lock waits for the winner's
 * access token. A rotated refresh token is stored before the lock is released.
 */
export async function getAccessToken(
  db: D1Database,
  box: SecretBox,
  client: OAuthClientConfig,
  accountId: string,
  options: AccessTokenOptions = {},
): Promise<string> {
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if ((await getAccount(db, accountId)).status !== 'ok') {
    throw new ReauthRequiredError(accountId);
  }

  for (let waited = 0; ; waited += WAIT_STEP_MS) {
    const cached = await loadAccessToken(db, box, accountId, now());
    if (cached) return cached;

    if (await tryAcquireRefreshLock(db, accountId, now(), LOCK_TTL_MS)) {
      try {
        // Another request may have finished between the cache check and taking the lock.
        return (
          (await loadAccessToken(db, box, accountId, now())) ??
          (await refresh(db, box, client, accountId, now))
        );
      } finally {
        await releaseRefreshLock(db, accountId);
      }
    }
    if (waited >= MAX_WAIT_MS) {
      throw new OAuthError('failed', 'Access token refresh of this account is still running');
    }
    await wait(WAIT_STEP_MS);
  }
}

async function refresh(
  db: D1Database,
  box: SecretBox,
  client: OAuthClientConfig,
  accountId: string,
  now: () => Date,
): Promise<string> {
  const refreshToken = await loadRefreshToken(db, box, accountId);
  let tokens;
  try {
    tokens = await refreshTokens(client, refreshToken);
  } catch (err) {
    if (err instanceof OAuthError && err.kind === 'reauth') {
      await markReauthRequired(db, accountId, now());
      throw new ReauthRequiredError(accountId);
    }
    throw err;
  }
  if (tokens.refreshToken !== null && tokens.refreshToken !== refreshToken) {
    await saveRefreshToken(db, box, accountId, tokens.refreshToken, now());
  }
  await saveAccessToken(
    db,
    box,
    accountId,
    tokens.accessToken,
    new Date(now().getTime() + tokens.expiresInSec * 1000),
  );
  return tokens.accessToken;
}
