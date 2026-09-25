import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizationUrl,
  exchangeCode,
  OAuthError,
  refreshTokens,
  type OAuthClientConfig,
} from './client';

// Fictional client used only in tests.
const CONFIG: OAuthClientConfig = {
  authorizeUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
  clientId: 'client-1',
  clientSecret: 'secret-1',
  scopes: ['read.a', 'read.b'],
  authorizeParams: { access_type: 'offline' },
};

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentForm(): URLSearchParams {
  const init = upstream.mock.calls[0]?.[1];
  return new URLSearchParams(String(init?.body));
}

describe('buildAuthorizationUrl', () => {
  it('asks for a code with PKCE and the given scopes', () => {
    const url = new URL(
      buildAuthorizationUrl(CONFIG, 'https://app.example.com/cb', 'state-1', 'challenge-1'),
    );
    expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      access_type: 'offline',
      response_type: 'code',
      client_id: 'client-1',
      redirect_uri: 'https://app.example.com/cb',
      scope: 'read.a read.b',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
    });
  });

  it('does not let extra parameters override the protocol ones', () => {
    const config = { ...CONFIG, authorizeParams: { state: 'evil', response_type: 'token' } };
    const url = new URL(buildAuthorizationUrl(config, 'https://app.example.com/cb', 'state-1', 'c'));
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('response_type')).toBe('code');
  });
});

describe('token requests', () => {
  it('exchanges a code with the verifier and reads the tokens', async () => {
    upstream.mockResolvedValue(
      Response.json({ access_token: 'at', expires_in: 3599, refresh_token: 'rt', id_token: 'idt', extra: 1 }),
    );
    const tokens = await exchangeCode(CONFIG, 'https://app.example.com/cb', 'code-1', 'verifier-1');
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresInSec: 3599, idToken: 'idt' });

    expect(upstream.mock.calls[0]?.[0]).toBe('https://auth.example.com/token');
    expect(Object.fromEntries(sentForm())).toEqual({
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: 'https://app.example.com/cb',
      code_verifier: 'verifier-1',
      client_id: 'client-1',
      client_secret: 'secret-1',
    });
  });

  it('refreshes and reports a refresh token that did not change as missing', async () => {
    upstream.mockResolvedValue(Response.json({ access_token: 'at2', expires_in: 3600 }));
    expect(await refreshTokens(CONFIG, 'rt')).toEqual({
      accessToken: 'at2',
      refreshToken: null,
      expiresInSec: 3600,
      idToken: null,
    });
    expect(Object.fromEntries(sentForm())).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
    });
  });

  it('maps a lost grant to reauth and keeps only the error code in the message', async () => {
    upstream.mockResolvedValue(
      Response.json(
        { error: 'invalid_grant', error_description: 'Token for anna@example.com revoked' },
        { status: 400 },
      ),
    );
    const err = await refreshTokens(CONFIG, 'rt').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect(err).toMatchObject({ kind: 'reauth', message: 'Token endpoint HTTP 400 invalid_grant' });
  });

  it('treats other refusals, odd bodies and bad shapes as plain failures', async () => {
    const failures: Response[] = [
      Response.json({ error: 'invalid_client' }, { status: 401 }),
      Response.json({ error: 'Some Text With Spaces' }, { status: 400 }),
      new Response('<html>Bad gateway</html>', { status: 502 }),
      Response.json({ access_token: 'at' }),
      Response.json({ access_token: '', expires_in: 60 }),
    ];
    for (const response of failures) {
      upstream.mockResolvedValueOnce(response);
      const err = await refreshTokens(CONFIG, 'rt').catch((e: unknown) => e);
      expect(err).toMatchObject({ name: 'OAuthError', kind: 'failed' });
      expect((err as Error).message).not.toMatch(/Bad gateway|Spaces/);
    }
  });
});
