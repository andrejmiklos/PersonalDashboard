import { ApiError } from '../errors';
import { ReauthRequiredError } from '../oauth/access-token';
import { OAuthError } from '../oauth/client';
import { ProviderError } from './types';

/**
 * Turns what an account provider throws into the API error the client should see (docs/07-api.md §3):
 * `409 reauth_required` with the account id, or `503 provider_unavailable`. Anything else is returned as it is.
 */
export function providerFailure(err: unknown): unknown {
  if (err instanceof ReauthRequiredError) {
    return new ApiError(409, 'reauth_required', 'Account needs to be reconnected', {
      accountId: err.accountId,
    });
  }
  if (err instanceof ProviderError || err instanceof OAuthError) {
    // Name and message only; both are free of payloads by construction.
    console.error(`provider failed: ${err.name}: ${err.message}`);
    return new ApiError(503, 'provider_unavailable', 'Data provider unavailable');
  }
  return err;
}
