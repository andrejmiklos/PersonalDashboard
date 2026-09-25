import { z } from 'zod';

/** Everything that differs between OAuth 2.0 providers. */
export interface OAuthClientConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** Extra query parameters of the authorisation request (e.g. `access_type=offline`). */
  authorizeParams?: Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  /** Null when the provider keeps the refresh token unchanged (Google); Microsoft rotates it. */
  refreshToken: string | null;
  expiresInSec: number;
  idToken: string | null;
}

/** The token endpoint refused the request. `reauth`: the grant is gone, the owner must connect again. */
export class OAuthError extends Error {
  readonly kind: 'reauth' | 'failed';

  constructor(kind: 'reauth' | 'failed', message: string) {
    super(message);
    this.name = 'OAuthError';
    this.kind = kind;
  }
}

const TIMEOUT_MS = 8_000;
/** Error codes of the token endpoint that mean the grant no longer works (RFC 6749 §5.2 and Microsoft). */
const REAUTH_ERRORS = new Set(['invalid_grant', 'interaction_required']);

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
});

export function buildAuthorizationUrl(
  config: OAuthClientConfig,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const url = new URL(config.authorizeUrl);
  const params: Record<string, string> = {
    ...config.authorizeParams,
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  };
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

async function requestTokens(config: OAuthClientConfig, grant: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      ...grant,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new OAuthError('failed', `Token endpoint HTTP ${res.status}, body is not JSON`);
  }

  if (!res.ok) {
    // Only the short error code is kept: bodies and descriptions may echo request values.
    const code = z.object({ error: z.string().regex(/^[a-z_]{1,40}$/) }).safeParse(body);
    const error = code.success ? code.data.error : 'unknown';
    throw new OAuthError(
      REAUTH_ERRORS.has(error) ? 'reauth' : 'failed',
      `Token endpoint HTTP ${res.status} ${error}`,
    );
  }

  const parsed = tokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new OAuthError('failed', 'Token endpoint answered with an unexpected shape');
  }
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? null,
    expiresInSec: parsed.data.expires_in,
    idToken: parsed.data.id_token ?? null,
  };
}

/** Exchanges the code of a callback (with the PKCE verifier) for tokens. */
export function exchangeCode(
  config: OAuthClientConfig,
  redirectUri: string,
  code: string,
  verifier: string,
): Promise<TokenSet> {
  return requestTokens(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
}

export function refreshTokens(config: OAuthClientConfig, refreshToken: string): Promise<TokenSet> {
  return requestTokens(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
}
