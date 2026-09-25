import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRefreshToken } from '../accounts/credentials';
import { listAccounts } from '../accounts/repository';
import { createApp } from '../app';
import { createSecretBox, toBase64 } from '../crypto/secret-box';
import type { Env } from '../env';
import { createTestD1, migrate } from '../test/d1';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';
import { codeChallenge } from './pkce';
import { createOAuthRoutes, type OAuthProviderDef } from './routes';

// Fictional provider and identities used only in tests.
const ORIGIN = 'https://dashboard.example.com';
const ENC_KEY = toBase64(new Uint8Array(32).fill(9));
const identify = vi.fn<OAuthProviderDef['identify']>();
const definition: OAuthProviderDef = {
  client: {
    authorizeUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    scopes: ['read.a', 'read.b'],
  },
  identify,
};
const upstream = vi.fn<typeof fetch>();
const errorLog = vi.spyOn(console, 'error');

let sqlite: DatabaseSync;
let env: Env;
let app: ReturnType<typeof createApp>;

function call(method: string, path: string, token?: string) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return app.request(`${ORIGIN}${path}`, { method, headers }, env);
}

async function startFlow(provider = 'google'): Promise<{ state: string; verifier: string; url: URL }> {
  const res = await call('POST', `/api/v1/admin/oauth/${provider}/start`, ADMIN_TOKEN);
  expect(res.status).toBe(200);
  const url = new URL(((await res.json()) as { url: string }).url);
  const state = url.searchParams.get('state') as string;
  const row = sqlite.prepare('SELECT verifier FROM oauth_states').get() as { verifier: string };
  return { state, verifier: row.verifier, url };
}

beforeEach(async () => {
  sqlite = migrate();
  env = { DB: createTestD1(sqlite), TOKEN_ENC_KEY: ENC_KEY } as Env;
  await seedTokens(sqlite);
  app = createApp();
  app.route(
    '/',
    createOAuthRoutes(() => definition),
  );

  identify.mockReset();
  identify.mockResolvedValue({ externalId: 'subject-1', displayName: 'anna@example.com' });
  upstream.mockReset();
  upstream.mockResolvedValue(Response.json({ access_token: 'at', expires_in: 3600, refresh_token: 'rt-1' }));
  vi.stubGlobal('fetch', upstream);
  errorLog.mockReset().mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/v1/admin/oauth/:provider/start', () => {
  it('is admin only', async () => {
    expect((await call('POST', '/api/v1/admin/oauth/google/start')).status).toBe(401);
    expect((await call('POST', '/api/v1/admin/oauth/google/start', DEVICE_TOKEN)).status).toBe(403);
  });

  it('returns the authorisation URL with state, PKCE challenge and our callback', async () => {
    const { url, verifier, state } = await startFlow();
    expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/oauth/google/callback`);
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('scope')).toBe('read.a read.b');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(await codeChallenge(verifier));
    expect(url.toString()).not.toContain(verifier);
    expect(state).toHaveLength(43);
  });

  it('rejects an unknown provider', async () => {
    expect((await call('POST', '/api/v1/admin/oauth/dropbox/start', ADMIN_TOKEN)).status).toBe(404);
  });

  it('reports a provider that is not available', async () => {
    app = createApp();
    app.route(
      '/',
      createOAuthRoutes(() => {
        throw new (class extends Error {})('boom');
      }),
    );
    expect((await call('POST', '/api/v1/admin/oauth/google/start', ADMIN_TOKEN)).status).toBe(500);
  });
});

describe('GET /oauth/:provider/callback', () => {
  it('connects the account and sends the browser back to the admin app', async () => {
    const { state, verifier } = await startFlow();
    const res = await call('GET', `/oauth/google/callback?code=code-1&state=${state}`);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?connected=google');

    const [account] = await listAccounts(env.DB);
    expect(account).toMatchObject({
      provider: 'google',
      externalId: 'subject-1',
      displayName: 'anna@example.com',
      scopes: 'read.a read.b',
      status: 'ok',
    });
    const box = await createSecretBox(ENC_KEY);
    expect(await loadRefreshToken(env.DB, box, (account as { id: string }).id)).toBe('rt-1');

    const form = new URLSearchParams(String(upstream.mock.calls[0]?.[1]?.body));
    expect(form.get('code')).toBe('code-1');
    expect(form.get('code_verifier')).toBe(verifier);
    expect(form.get('redirect_uri')).toBe(`${ORIGIN}/oauth/google/callback`);
    expect(identify).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'at', idToken: null }));
  });

  it('works once per state', async () => {
    const { state } = await startFlow();
    await call('GET', `/oauth/google/callback?code=code-1&state=${state}`);
    const replay = await call('GET', `/oauth/google/callback?code=code-2&state=${state}`);
    expect(replay.headers.get('Location')).toBe('/admin/#/accounts?error=invalid_state');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing, unknown or foreign state without calling the provider', async () => {
    const { state } = await startFlow('microsoft');
    for (const query of [
      'code=c',
      'code=c&state=',
      `code=c&state=${'a'.repeat(43)}`,
      `code=c&state=${state}`,
    ]) {
      const res = await call('GET', `/oauth/google/callback?${query}`);
      expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=invalid_state');
    }
    expect(upstream).not.toHaveBeenCalled();
    expect(await listAccounts(env.DB)).toEqual([]);
  });

  it('reports a cancelled consent and burns the state', async () => {
    const { state } = await startFlow();
    const res = await call('GET', `/oauth/google/callback?error=access_denied&state=${state}`);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=denied');
    const retry = await call('GET', `/oauth/google/callback?code=c&state=${state}`);
    expect(retry.headers.get('Location')).toBe('/admin/#/accounts?error=invalid_state');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('fails without an account when the code exchange is refused', async () => {
    const { state } = await startFlow();
    upstream.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const res = await call('GET', `/oauth/google/callback?code=bad&state=${state}`);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=failed');
    expect(await listAccounts(env.DB)).toEqual([]);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('HTTP 400 invalid_grant'));
  });

  it('fails when the provider issues no refresh token', async () => {
    const { state } = await startFlow();
    upstream.mockResolvedValue(Response.json({ access_token: 'at', expires_in: 3600 }));
    const res = await call('GET', `/oauth/google/callback?code=c&state=${state}`);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=failed');
    expect(identify).not.toHaveBeenCalled();
    expect(await listAccounts(env.DB)).toEqual([]);
  });

  it('fails cleanly when the encryption key is missing, without storing anything', async () => {
    const { state } = await startFlow();
    env = { DB: env.DB } as Env;
    const res = await call('GET', `/oauth/google/callback?code=c&state=${state}`);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=failed');
    expect(upstream).not.toHaveBeenCalled();
    expect(await listAccounts(env.DB)).toEqual([]);
  });

  it('does not log codes, tokens or the state', async () => {
    const { state } = await startFlow();
    upstream.mockRejectedValue(new TypeError('fetch failed'));
    await call('GET', `/oauth/google/callback?code=secret-code&state=${state}`);
    const logged = errorLog.mock.calls.flat().join(' ');
    expect(logged).toContain('fetch failed');
    expect(logged).not.toMatch(/secret-code|rt-1/);
    expect(logged).not.toContain(state);
  });
});
