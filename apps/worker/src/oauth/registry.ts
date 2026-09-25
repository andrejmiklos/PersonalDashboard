import { ApiError } from '../errors';
import type { OAuthProviderResolver } from './routes';

/** The provider definitions of this Worker. */
export const resolveOAuthProvider: OAuthProviderResolver = (_env, provider) => {
  throw new ApiError(501, 'not_implemented', `Connecting ${provider} accounts is not available yet`);
};
