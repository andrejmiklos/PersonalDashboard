import { googleOAuth } from '../providers/google/oauth';
import { microsoftOAuth } from '../providers/microsoft/oauth';
import type { OAuthProviderResolver } from './routes';

/** The provider definitions of this Worker. */
export const resolveOAuthProvider: OAuthProviderResolver = (env, provider) => {
  switch (provider) {
    case 'google':
      return googleOAuth(env);
    case 'microsoft':
      return microsoftOAuth(env);
  }
};
