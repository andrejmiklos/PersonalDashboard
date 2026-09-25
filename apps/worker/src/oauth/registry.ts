import { ApiError } from '../errors';
import { googleOAuth } from '../providers/google/oauth';
import type { OAuthProviderResolver } from './routes';

/** The provider definitions of this Worker. */
export const resolveOAuthProvider: OAuthProviderResolver = (env, provider) => {
  switch (provider) {
    case 'google':
      return googleOAuth(env);
    case 'microsoft':
      throw new ApiError(501, 'not_implemented', 'Connecting microsoft accounts is not available yet');
  }
};
