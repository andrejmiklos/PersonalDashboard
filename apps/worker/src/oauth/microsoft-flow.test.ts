import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRefreshToken } from '../accounts/credentials';
import { listAccounts } from '../accounts/repository';
import { createSecretBox, toBase64 } from '../crypto/secret-box';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { taskListsFixture } from '../test/graph-todo';
import { ADMIN_TOKEN, seedTokens } from '../test/tokens';

// Fictional origin, credentials and identities used only in tests.
const ORIGIN = 'https://dashboard.example.com';
const ENC_KEY = toBase64(new Uint8Array(32).fill(2));
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

let sqlite: DatabaseSync;
let env: Env;
/** Refresh tokens the token endpoint accepts: it rotates on every use, like Microsoft. */
let validRefresh: string;
let refreshCount: number;
const upstream = vi.fn<typeof fetch>();
const errorLog = vi.spyOn(console, 'error');

function call(method: string, path: string, token: string | null = ADMIN_TOKEN) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method, headers }), env);
}

async function connect(): Promise<string> {
  const start = await call('POST', '/api/v1/admin/oauth/microsoft/start');
  expect(start.status).toBe(200);
  const url = new URL(((await start.json()) as { url: string }).url);
  const res = await call(
    'GET',
    `/oauth/microsoft/callback?code=code-1&state=${url.searchParams.get('state')}`,
    null,
  );
  expect(res.headers.get('Location')).toBe('/admin/#/accounts?connected=microsoft');
  return ((await listAccounts(env.DB))[0] as { id: string }).id;
}

beforeEach(() => {
  sqlite = migrate();
  env = {
    DB: createTestD1(sqlite),
    TOKEN_ENC_KEY: ENC_KEY,
    MS_CLIENT_ID: 'client-1',
    MS_CLIENT_SECRET: 'secret-1',
  } as Env;
  validRefresh = 'rt-1';
  refreshCount = 0;

  upstream.mockReset();
  upstream.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      const form = new URLSearchParams(String(init?.body));
      if (form.get('grant_type') === 'authorization_code') {
        return Response.json({ access_token: 'at-0', expires_in: 3600, refresh_token: 'rt-1' });
      }
      refreshCount++;
      // A refresh token works once; the answer carries the next one.
      if (form.get('refresh_token') !== validRefresh) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      validRefresh = `rt-${refreshCount + 1}`;
      return Response.json({
        access_token: `at-${refreshCount}`,
        expires_in: 3600,
        refresh_token: validRefresh,
      });
    }
    if (url.startsWith('https://graph.microsoft.com/v1.0/me?')) {
      return Response.json({ id: 'ms-subject-1', mail: 'anna@example.com' });
    }
    if (url.startsWith('https://graph.microsoft.com/v1.0/me/todo/lists')) {
      return Response.json(taskListsFixture());
    }
    return new Response('unexpected', { status: 500 });
  });
  vi.stubGlobal('fetch', upstream);
  errorLog.mockReset().mockImplementation(() => undefined);
  return seedTokens(sqlite);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connecting a Microsoft account', () => {
  it('sends the owner to the consumer authority with PKCE and the To Do scopes', async () => {
    const res = await call('POST', '/api/v1/admin/oauth/microsoft/start');
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/oauth/microsoft/callback`);
    expect(url.searchParams.get('scope')).toBe('Tasks.ReadWrite offline_access User.Read');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('stores the account with its sealed refresh token', async () => {
    const id = await connect();
    const [account] = await listAccounts(env.DB);
    expect(account).toMatchObject({
      provider: 'microsoft',
      externalId: 'ms-subject-1',
      displayName: 'anna@example.com',
      status: 'ok',
    });
    expect(await loadRefreshToken(env.DB, await createSecretBox(ENC_KEY), id)).toBe('rt-1');
  });

  it('fails without storing anything when Microsoft does not tell who signed in', async () => {
    const start = await call('POST', '/api/v1/admin/oauth/microsoft/start');
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state');
    upstream.mockImplementation(async (input) =>
      String(input) === TOKEN_URL
        ? Response.json({ access_token: 'at-0', expires_in: 3600, refresh_token: 'rt-1' })
        : new Response('nope', { status: 401 }),
    );
    const res = await call('GET', `/oauth/microsoft/callback?code=code-1&state=${state}`, null);
    expect(res.headers.get('Location')).toBe('/admin/#/accounts?error=failed');
    expect(await listAccounts(env.DB)).toEqual([]);
  });
});

describe('rotating refresh tokens', () => {
  const discover = (id: string) => call('GET', `/api/v1/accounts/${id}/discover`);
  const expireAccessToken = () => sqlite.prepare('UPDATE accounts SET access_expires_at = NULL').run();

  it('lists the task lists and keeps the rotated token for the next refresh', async () => {
    const id = await connect();
    const res = await discover(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { kind: 'task_list', remoteId: 'list-1=', label: 'Tasks', color: null, sourceId: null },
      { kind: 'task_list', remoteId: 'list-2=', label: 'Shopping', color: null, sourceId: null },
    ]);
    expect(await loadRefreshToken(env.DB, await createSecretBox(ENC_KEY), id)).toBe('rt-2');

    // A refresh with the old token would now be refused; the stored one must be spent.
    expireAccessToken();
    expect((await discover(id)).status).toBe(200);
    expect(await loadRefreshToken(env.DB, await createSecretBox(ENC_KEY), id)).toBe('rt-3');
    expect(refreshCount).toBe(2);
  });

  it('spends a refresh token once even when requests arrive together', async () => {
    const id = await connect();
    const responses = await Promise.all([discover(id), discover(id), discover(id)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCount).toBe(1);
    expect(await loadRefreshToken(env.DB, await createSecretBox(ENC_KEY), id)).toBe('rt-2');
  });

  it('asks for a reconnect when Microsoft no longer accepts the refresh token', async () => {
    const id = await connect();
    validRefresh = 'revoked';
    const res = await discover(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'reauth_required', accountId: id } });
    expect((await listAccounts(env.DB))[0]?.status).toBe('reauth_required');
  });

  it('adds a list as a source of kind task_list', async () => {
    const id = await connect();
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/v1/accounts/${id}/sources`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteId: 'list-2=' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ kind: 'task_list', remoteId: 'list-2=', label: 'Shopping' });
  });
});
