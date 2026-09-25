import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRefreshToken, saveAccessToken, tryAcquireRefreshLock } from '../accounts/credentials';
import { getAccount, upsertAccount } from '../accounts/repository';
import { createSecretBox, toBase64, type SecretBox } from '../crypto/secret-box';
import { createTestD1, migrate } from '../test/d1';
import { getAccessToken, ReauthRequiredError } from './access-token';
import type { OAuthClientConfig } from './client';

// Fictional client, account and tokens used only in tests.
const CLIENT: OAuthClientConfig = {
  authorizeUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  scopes: ['read'],
};
const T0 = new Date('2026-01-15T08:00:00.000Z');

let sqlite: DatabaseSync;
let db: D1Database;
let box: SecretBox;
let accountId: string;
let clock: Date;
const upstream = vi.fn<typeof fetch>();
const options = { now: () => clock, wait: async () => undefined };

beforeEach(async () => {
  sqlite = migrate();
  db = createTestD1(sqlite);
  box = await createSecretBox(toBase64(new Uint8Array(32).fill(5)));
  accountId = (
    await upsertAccount(
      db,
      box,
      {
        provider: 'microsoft',
        externalId: 'subject-1',
        displayName: null,
        refreshToken: 'rt-1',
        scopes: 'read',
      },
      T0,
    )
  ).id;
  clock = T0;
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAccessToken', () => {
  it('refreshes once and serves the cached token afterwards', async () => {
    upstream.mockResolvedValue(Response.json({ access_token: 'at-1', expires_in: 3600 }));
    expect(await getAccessToken(db, box, CLIENT, accountId, options)).toBe('at-1');
    expect(await getAccessToken(db, box, CLIENT, accountId, options)).toBe('at-1');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare('SELECT refresh_lock_until FROM accounts').get()).toEqual({
      refresh_lock_until: null,
    });
  });

  it('refreshes again when the cached token is about to expire', async () => {
    upstream.mockResolvedValueOnce(Response.json({ access_token: 'at-1', expires_in: 3600 }));
    await getAccessToken(db, box, CLIENT, accountId, options);

    clock = new Date(T0.getTime() + 3_541_000);
    upstream.mockResolvedValueOnce(Response.json({ access_token: 'at-2', expires_in: 3600 }));
    expect(await getAccessToken(db, box, CLIENT, accountId, options)).toBe('at-2');
  });

  it('stores a rotated refresh token before anything else uses it', async () => {
    upstream.mockResolvedValue(
      Response.json({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-2' }),
    );
    await getAccessToken(db, box, CLIENT, accountId, options);
    expect(await loadRefreshToken(db, box, accountId)).toBe('rt-2');
  });

  it('keeps the refresh token when the provider does not send a new one', async () => {
    upstream.mockResolvedValue(Response.json({ access_token: 'at-1', expires_in: 3600 }));
    await getAccessToken(db, box, CLIENT, accountId, options);
    expect(await loadRefreshToken(db, box, accountId)).toBe('rt-1');
  });

  it('marks the account for reconnecting when the grant is gone, and stops calling the provider', async () => {
    upstream.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(getAccessToken(db, box, CLIENT, accountId, options)).rejects.toBeInstanceOf(
      ReauthRequiredError,
    );
    expect((await getAccount(db, accountId)).status).toBe('reauth_required');
    expect(sqlite.prepare('SELECT refresh_lock_until FROM accounts').get()).toEqual({
      refresh_lock_until: null,
    });

    const err = await getAccessToken(db, box, CLIENT, accountId, options).catch((e: unknown) => e);
    expect(err).toMatchObject({ accountId });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('releases the lock when the provider fails', async () => {
    upstream.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getAccessToken(db, box, CLIENT, accountId, options)).rejects.toThrow('fetch failed');
    expect(await tryAcquireRefreshLock(db, accountId, clock, 1_000)).toBe(true);
  });

  it('waits for the request that holds the lock and uses its token', async () => {
    await tryAcquireRefreshLock(db, accountId, clock, 15_000);
    let waits = 0;
    const wait = async () => {
      if (++waits === 2)
        await saveAccessToken(db, box, accountId, 'at-from-other', new Date(T0.getTime() + 3_600_000));
    };
    expect(await getAccessToken(db, box, CLIENT, accountId, { ...options, wait })).toBe('at-from-other');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('gives up when the lock stays taken', async () => {
    await tryAcquireRefreshLock(db, accountId, clock, 15_000);
    const err = await getAccessToken(db, box, CLIENT, accountId, options).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'OAuthError', kind: 'failed' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('does not leave concurrent refreshes spending the same refresh token twice', async () => {
    upstream.mockImplementation(async () =>
      Response.json({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-2' }),
    );
    const realWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 1)));
    const results = await Promise.all(
      [1, 2, 3].map(() => getAccessToken(db, box, CLIENT, accountId, { now: () => clock, wait: realWait })),
    );
    expect(results).toEqual(['at-1', 'at-1', 'at-1']);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
