import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { toBase64Url } from '../../oauth/pkce';
import { calendarListFixture } from '../../test/google-calendar';
import { googleClient, googleOAuth, GOOGLE_SCOPES, subjectFromIdToken } from './oauth';

// Fictional credentials and identities used only in tests.
const env = { GOOGLE_CLIENT_ID: 'id-1.apps.example.com', GOOGLE_CLIENT_SECRET: 'secret-1' } as Env;
const upstream = vi.fn<typeof fetch>();

function idToken(claims: unknown): string {
  const part = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('googleClient', () => {
  it('asks for offline access, read-only calendar scopes and no profile data', () => {
    const client = googleClient(env);
    expect(client).toMatchObject({
      clientId: 'id-1.apps.example.com',
      authorizeParams: { access_type: 'offline', prompt: 'consent' },
    });
    expect(client.scopes).toEqual(GOOGLE_SCOPES);
    expect(client.scopes.join(' ')).not.toMatch(/email|profile/);
    expect(client.scopes.filter((s) => s.startsWith('https:')).every((s) => s.endsWith('.readonly'))).toBe(
      true,
    );
  });

  it('refuses to run without credentials', () => {
    expect(() => googleClient({} as Env)).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => googleClient({ GOOGLE_CLIENT_ID: 'x' } as Env)).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});

describe('subjectFromIdToken', () => {
  it('reads the subject, also from a payload with non-ASCII claims', () => {
    expect(subjectFromIdToken(idToken({ sub: '1234567890', name: 'Žofia Ľubová' }))).toBe('1234567890');
  });

  it('rejects malformed tokens and tokens without a subject', () => {
    for (const bad of ['', 'nodots', 'a.!!!.c', idToken({}), idToken({ sub: '' }), idToken({ sub: 42 })]) {
      expect(() => subjectFromIdToken(bad)).toThrow(/ID token/);
    }
  });
});

describe('googleOAuth.identify', () => {
  const tokens = { accessToken: 'access-1', refreshToken: 'refresh-1', expiresInSec: 3600 };

  it('uses the subject as id and the primary calendar as label', async () => {
    upstream.mockResolvedValue(Response.json(calendarListFixture()));
    const identity = await googleOAuth(env).identify({ ...tokens, idToken: idToken({ sub: 'subject-1' }) });
    expect(identity).toEqual({ externalId: 'subject-1', displayName: 'anna@example.com' });
  });

  it('still connects when the label cannot be read', async () => {
    upstream.mockResolvedValue(new Response('nope', { status: 500 }));
    const identity = await googleOAuth(env).identify({ ...tokens, idToken: idToken({ sub: 'subject-1' }) });
    expect(identity).toEqual({ externalId: 'subject-1', displayName: null });
  });

  it('fails without an ID token', async () => {
    await expect(googleOAuth(env).identify({ ...tokens, idToken: null })).rejects.toThrow('no ID token');
    expect(upstream).not.toHaveBeenCalled();
  });
});
