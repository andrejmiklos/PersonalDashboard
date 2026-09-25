import { z } from 'zod';
import type { Env } from '../../env';
import { ApiError } from '../../errors';
import type { OAuthClientConfig } from '../../oauth/client';
import type { OAuthProviderDef } from '../../oauth/routes';
import { fetchJson, ProviderError } from '../types';

/** `offline_access` yields the refresh token; `User.Read` only serves to identify the account. */
export const MICROSOFT_SCOPES = ['Tasks.ReadWrite', 'offline_access', 'User.Read'];

const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';

/** Microsoft client of this Worker (personal accounts only); the credentials are Worker secrets. */
export function microsoftClient(env: Env): OAuthClientConfig {
  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    throw new ApiError(500, 'not_configured', 'MS_CLIENT_ID and MS_CLIENT_SECRET are not set');
  }
  return {
    authorizeUrl: `${AUTHORITY}/authorize`,
    tokenUrl: `${AUTHORITY}/token`,
    clientId: env.MS_CLIENT_ID,
    clientSecret: env.MS_CLIENT_SECRET,
    scopes: MICROSOFT_SCOPES,
    // Lets the owner pick the account when several are signed in to the browser.
    authorizeParams: { response_mode: 'query', prompt: 'select_account' },
  };
}

const meSchema = z.object({
  id: z.string().min(1).max(255),
  mail: z.string().nullish(),
  userPrincipalName: z.string().nullish(),
});

/** The stable id of the signed-in account and its address, which only labels the account in admin. */
export function mapMe(raw: unknown): { externalId: string; displayName: string | null } {
  const parsed = meSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError('Unexpected profile response');
  return {
    externalId: parsed.data.id,
    displayName: parsed.data.mail || parsed.data.userPrincipalName || null,
  };
}

export function microsoftOAuth(env: Env): OAuthProviderDef {
  return {
    client: microsoftClient(env),
    async identify(tokens) {
      const raw = await fetchJson('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName', {
        Authorization: `Bearer ${tokens.accessToken}`,
      });
      return mapMe(raw);
    },
  };
}
