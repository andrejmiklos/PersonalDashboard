import { z } from 'zod';
import type { Env } from '../../env';
import { ApiError } from '../../errors';
import { OAuthError, type OAuthClientConfig } from '../../oauth/client';
import { fromBase64Url } from '../../oauth/pkce';
import type { OAuthProviderDef } from '../../oauth/routes';
import { listCalendars } from './calendar';

/** `openid` only yields the stable subject id; no e-mail or profile scope is requested. */
export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];

/** Google client of this Worker; the credentials are Worker secrets. */
export function googleClient(env: Env): OAuthClientConfig {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(500, 'not_configured', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set');
  }
  return {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    scopes: GOOGLE_SCOPES,
    // offline + consent make Google issue a refresh token on every connect, also when reconnecting.
    authorizeParams: { access_type: 'offline', prompt: 'consent' },
  };
}

const idTokenClaims = z.object({ sub: z.string().min(1).max(255) });

/**
 * The subject id of an ID token. The token comes straight from Google's token endpoint over TLS, which
 * OpenID Connect accepts without checking its signature (Core §3.1.3.7).
 */
export function subjectFromIdToken(idToken: string): string {
  const payload = idToken.split('.')[1];
  if (!payload) throw new OAuthError('failed', 'ID token is malformed');
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    throw new OAuthError('failed', 'ID token is malformed');
  }
  const parsed = idTokenClaims.safeParse(claims);
  if (!parsed.success) throw new OAuthError('failed', 'ID token has no subject');
  return parsed.data.sub;
}

export function googleOAuth(env: Env): OAuthProviderDef {
  return {
    client: googleClient(env),
    async identify(tokens) {
      if (tokens.idToken === null) throw new OAuthError('failed', 'Google issued no ID token');
      const externalId = subjectFromIdToken(tokens.idToken);
      // The primary calendar is named after the account (its e-mail address); it only labels the account.
      const displayName = await listCalendars(tokens.accessToken).then(
        (calendars) => calendars.find((c) => c.primary)?.id ?? null,
        () => null,
      );
      return { externalId, displayName };
    },
  };
}
