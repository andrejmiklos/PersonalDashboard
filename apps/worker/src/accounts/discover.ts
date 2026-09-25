import type { SecretBox } from '../crypto/secret-box';
import type { Env } from '../env';
import { ApiError } from '../errors';
import { getAccessToken } from '../oauth/access-token';
import { resolveOAuthProvider } from '../oauth/registry';
import { listCalendars } from '../providers/google/calendar';
import type { Account, SourceKind } from './repository';

/** A calendar or task list that exists at the provider and can be added as a source. */
export interface DiscoveredSource {
  kind: SourceKind;
  remoteId: string;
  label: string;
  /** The provider's own colour, only a hint. */
  color: string | null;
}

/** Live list of the calendars / task lists of an account (docs/07-api.md §6). */
export async function discoverSources(
  env: Env,
  box: SecretBox,
  account: Account,
): Promise<DiscoveredSource[]> {
  const { client } = resolveOAuthProvider(env, account.provider);
  const accessToken = await getAccessToken(env.DB, box, client, account.id);
  switch (account.provider) {
    case 'google':
      return (await listCalendars(accessToken)).map((calendar) => ({
        kind: 'calendar',
        remoteId: calendar.id,
        label: calendar.label,
        color: calendar.color,
      }));
    case 'microsoft':
      throw new ApiError(501, 'not_implemented', 'Microsoft task lists are not available yet');
  }
}
