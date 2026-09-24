import type { DataEnvelope } from '@dashboard/shared';
import { ApiError } from '../errors';
import type { Provider } from '../providers/types';

interface CacheRow {
  payload: string;
  fetched_at: string;
}

async function readRow(db: D1Database, key: string): Promise<{ data: unknown; fetchedAt: string } | null> {
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
}

/** Stores the payload and prunes rows no provider may serve any more (e.g. after a location change). */
async function writeRow(
  db: D1Database,
  key: string,
  data: unknown,
  fetchedAt: Date,
  staleSeconds: number,
): Promise<void> {
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
}

/**
 * Serves provider data through the D1 cache (docs/01-architecture.md §3.2): fresh rows as they are,
 * otherwise a new provider call; when that fails, a row within the stale window with `stale: true`,
 * else `503 provider_unavailable`.
 */
export async function loadCached<TParams, TData>(
  db: D1Database,
  provider: Provider<TParams, TData>,
  params: TParams,
  now: Date = new Date(),
): Promise<DataEnvelope<TData>> {
  const key = provider.cacheKey(params);
  const cached = await readRow(db, key);
  const ageMs = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;

  if (cached && ageMs < provider.ttlSeconds * 1000) {
    return { updatedAt: cached.fetchedAt, ttl: provider.ttlSeconds, data: cached.data as TData };
  }

  let data: TData;
  try {
    data = await provider.fetch(params);
  } catch (err) {
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
    await writeRow(db, key, data, now, provider.staleSeconds);
  } catch (err) {
    // The fresh data is still worth serving; the next request simply calls the provider again.
    console.error(`provider cache write failed: ${err instanceof Error ? err.name : 'unknown'}`);
  }
  return { updatedAt: now.toISOString(), ttl: provider.ttlSeconds, data };
}
