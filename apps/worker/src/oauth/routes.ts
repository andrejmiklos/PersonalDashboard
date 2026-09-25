import { Hono } from 'hono';
import { ACCOUNT_PROVIDERS, upsertAccount, type AccountProvider } from '../accounts/repository';
import { requireAuth } from '../auth/middleware';
import { createSecretBox } from '../crypto/secret-box';
import type { AppEnv, Env } from '../env';
import { ApiError } from '../errors';
import {
  buildAuthorizationUrl,
  exchangeCode,
  OAuthError,
  type OAuthClientConfig,
  type TokenSet,
} from './client';
import { codeChallenge } from './pkce';
import { consumeOAuthState, createOAuthState } from './state';

/** What a provider adds to the shared flow: its client settings and how to tell which account signed in. */
export interface OAuthProviderDef {
  client: OAuthClientConfig;
  /** Subject id (stable per account) and a label for the admin; called right after the code exchange. */
  identify(tokens: TokenSet): Promise<{ externalId: string; displayName: string | null }>;
}

export type OAuthProviderResolver = (env: Env, provider: AccountProvider) => OAuthProviderDef;

function parseProvider(value: string | undefined): AccountProvider {
  const provider = ACCOUNT_PROVIDERS.find((p) => p === value);
  if (!provider) throw new ApiError(404, 'not_found', 'Unknown provider');
  return provider;
}

function redirectUri(requestUrl: string, provider: AccountProvider): string {
  return `${new URL(requestUrl).origin}/oauth/${provider}/callback`;
}

/**
 * Connect flow shared by all providers (docs/05-integrations.md §1.2): the admin starts it with the admin
 * token, the browser returns to the callback, which is authenticated by the single-use `state` alone.
 */
export function createOAuthRoutes(resolve: OAuthProviderResolver): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/api/v1/admin/oauth/:provider/start', requireAuth('admin'), async (c) => {
    const provider = parseProvider(c.req.param('provider'));
    const def = resolve(c.env, provider);
    const { state, verifier } = await createOAuthState(c.env.DB, provider, new Date());
    const url = buildAuthorizationUrl(
      def.client,
      redirectUri(c.req.url, provider),
      state,
      await codeChallenge(verifier),
    );
    return c.json({ url });
  });

  routes.get('/oauth/:provider/callback', async (c) => {
    const provider = parseProvider(c.req.param('provider'));
    const { code, state, error } = c.req.query();
    // The result goes to the admin app in the URL fragment, which is never sent to a server.
    const finish = (result: string) => c.redirect(`/admin/#/accounts?${result}`, 303);

    const verifier = state ? await consumeOAuthState(c.env.DB, provider, state, new Date()) : null;
    if (verifier === null) return finish('error=invalid_state');
    if (error !== undefined || !code || code.length > 2048) return finish('error=denied');

    try {
      const def = resolve(c.env, provider);
      const box = await createSecretBox(c.env.TOKEN_ENC_KEY);
      const tokens = await exchangeCode(def.client, redirectUri(c.req.url, provider), code, verifier);
      if (tokens.refreshToken === null) {
        throw new OAuthError('failed', 'Provider issued no refresh token');
      }
      const identity = await def.identify(tokens);
      await upsertAccount(
        c.env.DB,
        box,
        {
          provider,
          externalId: identity.externalId,
          displayName: identity.displayName,
          refreshToken: tokens.refreshToken,
          scopes: def.client.scopes.join(' '),
        },
        new Date(),
      );
    } catch (err) {
      // Name and message only; provider errors carry no payloads (see OAuthError).
      console.error(
        `oauth ${provider} callback failed: ${err instanceof Error ? `${err.name}: ${err.message}` : 'unknown'}`,
      );
      return finish('error=failed');
    }
    return finish(`connected=${provider}`);
  });

  return routes;
}
