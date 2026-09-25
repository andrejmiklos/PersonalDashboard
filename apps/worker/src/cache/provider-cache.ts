import type { DataEnvelope } from '@dashboard/shared';
import { ApiError } from '../errors';
import { ReauthRequiredError } from '../oauth/access-token';
import { providerFailure } from '../providers/failure';
import type { Provider } from '../providers/types';

/** Where normalised provider payloads are kept between requests. */
export interface CacheStore {
  read(key: string): Promise<{ data: unknown; fetchedAt: string } | null>;
  /** Stores the payload and drops rows no provider may serve any more. */
  write(key: string, data: unknown, fetchedAt: Date, staleSeconds: number): Promise<void>;
}

interface CacheRow {
  payload: string;
  fetched_at: string;
}

/** Plain D1 cache for payloads without personal data (weather, air quality; D-20). */
export function d1Store(db: D1Database): CacheStore {
  return {
    async read(key) {
      const row = await db
        .prepare('SELECT payload, fetched_at FROM provider_cache WHERE key = ?')
        .bind(key)
        .first<CacheRow>();
      if (!row) return null;
      try {
        return { data: JSON.parse(row.payload), fetchedAt: row.fetched_at };
      } catch {
        return null;
      }
    },

    // Also prunes rows no provider may serve any more (e.g. after a location change).
    async write(key, data, fetchedAt, staleSeconds) {
      const pruneBefore = new Date(fetchedAt.getTime() - staleSeconds * 1000).toISOString();
      await db.batch([
        db
          .prepare(
            `INSERT INTO provider_cache (key, payload, fetched_at) VALUES (?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
          )
          .bind(key, JSON.stringify(data), fetchedAt.toISOString()),
        db.prepare('DELETE FROM provider_cache WHERE fetched_at < ?').bind(pruneBefore),
      ]);
    },
  };
}

/**
 * Serves provider data through a cache store (docs/01-architecture.md §3.2): fresh rows as they are,
 * otherwise a new provider call; when that fails, a row within the stale window with `stale: true`,
 * else `503 provider_unavailable`. A missing consent (`409 reauth_required`) and configuration errors are
 * not hidden behind old data.
 */
export async function loadCached<TParams, TData>(
  store: CacheStore,
  provider: Provider<TParams, TData>,
  params: TParams,
  now: Date = new Date(),
): Promise<DataEnvelope<TData>> {
  const key = provider.cacheKey(params);
  const cached = await store.read(key);
  const ageMs = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;

  if (cached && ageMs < provider.ttlSeconds * 1000) {
    return { updatedAt: cached.fetchedAt, ttl: provider.ttlSeconds, data: cached.data as TData };
  }

  let data: TData;
  try {
    data = await provider.fetch(params);
  } catch (err) {
    if (err instanceof ReauthRequiredError) throw providerFailure(err);
    if (err instanceof ApiError) throw err;
    // Name and message only; ProviderError messages never contain payloads.
    console.error(
      `provider ${provider.name} failed: ${err instanceof Error ? `${err.name}: ${err.message}` : 'unknown'}`,
    );
    if (cached && ageMs <= provider.staleSeconds * 1000) {
      return {
        updatedAt: cached.fetchedAt,
        ttl: provider.ttlSeconds,
        stale: true,
        data: cached.data as TData,
      };
    }
    throw new ApiError(503, 'provider_unavailable', 'Data provider unavailable');
  }

  try {
    await store.write(key, data, now, provider.staleSeconds);
  } catch (err) {
    // The fresh data is still worth serving; the next request simply calls the provider again.
    console.error(`provider cache write failed: ${err instanceof Error ? err.name : 'unknown'}`);
  }
  return { updatedAt: now.toISOString(), ttl: provider.ttlSeconds, data };
}
