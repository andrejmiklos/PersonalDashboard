import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { ProviderError } from '../types';
import { mapMe, MICROSOFT_SCOPES, microsoftClient, microsoftOAuth } from './oauth';

// Fictional credentials and identities used only in tests.
const env = { MS_CLIENT_ID: '00000000-0000-0000-0000-000000000001', MS_CLIENT_SECRET: 'secret-1' } as Env;
const upstream = vi.fn<typeof fetch>();
const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSec: 3600, idToken: null };

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('microsoftClient', () => {
  it('targets personal accounts, asks for offline access and lets the owner pick the account', () => {
    const client = microsoftClient(env);
    expect(client.authorizeUrl).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(client.tokenUrl).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
    expect(client.scopes).toEqual(MICROSOFT_SCOPES);
    expect(client.scopes).toContain('offline_access');
    expect(client.authorizeParams).toMatchObject({ prompt: 'select_account' });
  });

  it('only asks for what To Do needs', () => {
    expect(MICROSOFT_SCOPES.filter((s) => s !== 'offline_access').sort()).toEqual([
      'Tasks.ReadWrite',
      'User.Read',
    ]);
  });

  it('refuses to run without credentials', () => {
    expect(() => microsoftClient({} as Env)).toThrow(/MS_CLIENT_ID/);
    expect(() => microsoftClient({ MS_CLIENT_ID: 'x' } as Env)).toThrow(/MS_CLIENT_SECRET/);
  });
});

describe('mapMe', () => {
  it('uses the object id and prefers the mail address as label', () => {
    expect(
      mapMe({ id: 'abc123', mail: 'anna@example.com', userPrincipalName: 'anna_upn@example.com' }),
    ).toEqual({
      externalId: 'abc123',
      displayName: 'anna@example.com',
    });
    expect(mapMe({ id: 'abc123', mail: null, userPrincipalName: 'anna_upn@example.com' }).displayName).toBe(
      'anna_upn@example.com',
    );
    expect(mapMe({ id: 'abc123' }).displayName).toBeNull();
  });

  it('rejects a response without an id', () => {
    expect(() => mapMe({ mail: 'x@example.com' })).toThrow(ProviderError);
    expect(() => mapMe({ id: '' })).toThrow(ProviderError);
  });
});

describe('microsoftOAuth.identify', () => {
  it('reads the profile with the new access token', async () => {
    upstream.mockResolvedValue(Response.json({ id: 'abc123', mail: 'anna@example.com' }));
    expect(await microsoftOAuth(env).identify(tokens)).toEqual({
      externalId: 'abc123',
      displayName: 'anna@example.com',
    });
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });

  it('fails when the account cannot be identified', async () => {
    upstream.mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(microsoftOAuth(env).identify(tokens)).rejects.toBeInstanceOf(ProviderError);
  });
});
