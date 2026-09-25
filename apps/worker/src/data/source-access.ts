import type { SourceInfo } from '@dashboard/shared';
import { listAccounts, type Source } from '../accounts/repository';
import type { CacheStore } from '../cache/provider-cache';
import { sealedStore } from '../cache/sealed-store';
import { createSecretBox } from '../crypto/secret-box';
import type { Env } from '../env';
import { getAccessToken, ReauthRequiredError } from '../oauth/access-token';
import { resolveOAuthProvider } from '../oauth/registry';
import { providerFailure } from '../providers/failure';

export interface OpenedSources {
  /** Sealed cache for the personal payloads of the sources. */
  store: CacheStore;
  /** The access token of the source's account; requests of one account share one token. */
  accessToken(source: Source): Promise<string>;
}

/**
 * Prepares reading from the accounts behind `sources`. An account that needs a new consent fails the
 * request at once (`409 reauth_required`), also while a cache would still answer: the tile should ask for
 * the reconnect instead of showing data that will never refresh.
 */
export async function openSources(env: Env, sources: Source[]): Promise<OpenedSources> {
  const accounts = new Map((await listAccounts(env.DB)).map((account) => [account.id, account]));
  for (const source of sources) {
    if (accounts.get(source.accountId)?.status !== 'ok') {
      throw providerFailure(new ReauthRequiredError(source.accountId));
    }
  }

  const box = await createSecretBox(env.TOKEN_ENC_KEY);
  const tokens = new Map<string, Promise<string>>();
  return {
    store: sealedStore(env.DB, box),
    accessToken(source) {
      let token = tokens.get(source.accountId);
      if (!token) {
        const provider = accounts.get(source.accountId)?.provider ?? 'google';
        token = getAccessToken(env.DB, box, resolveOAuthProvider(env, provider).client, source.accountId);
        tokens.set(source.accountId, token);
      }
      return token;
    },
  };
}

/** Freshness of a payload merged from several sources: the oldest `updatedAt`, stale if any part is. */
export function mergedMeta(results: { updatedAt: string; stale?: true }[]): {
  updatedAt: string;
  stale?: true;
} {
  return {
    updatedAt: results.map((r) => r.updatedAt).reduce((a, b) => (a < b ? a : b)),
    ...(results.some((r) => r.stale) && { stale: true as const }),
  };
}

export function sourceInfos(sources: Source[]): SourceInfo[] {
  return sources.map((s) => ({ id: s.id, label: s.label, color: s.color }));
}
