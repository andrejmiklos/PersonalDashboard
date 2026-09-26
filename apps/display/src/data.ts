import type { DataEnvelope } from '@dashboard/shared';
import type { DataClient, DataResult } from '@dashboard/tiles';
import { readCache, writeCache } from './cache';

// Tile data layer (docs/01-architecture.md §2.2 and §5).

const REQUEST_TIMEOUT_MS = 10_000;
/** A cached payload older than this is not shown any more, even while offline. */
const MAX_CACHED_AGE_MS = 24 * 60 * 60_000;
/** Failures that say nothing about the data itself; the last payload is still worth showing. */
const TRANSIENT_CODES = new Set<string | null>([
  null,
  'provider_unavailable',
  'internal_error',
  'rate_limited',
]);

function errorCode(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

async function request<T>(
  token: string,
  path: string,
  change?: { method: string; body: unknown },
): Promise<DataResult<T>> {
  // AbortSignal.timeout is Chrome 103+.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...(change && { method: change.method, body: JSON.stringify(change.body) }),
      headers: { Authorization: `Bearer ${token}`, ...(change && { 'Content-Type': 'application/json' }) },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    const body = (await res.json()) as unknown;
    if (res.ok) return { kind: 'ok', envelope: body as DataEnvelope<T> };
    return { kind: 'error', code: errorCode(body) };
  } catch {
    return { kind: 'error', code: null };
  } finally {
    clearTimeout(timer);
  }
}

export function createDataClient(getToken: () => string | null, storage: Storage | null): DataClient {
  const key = (type: string, search: string) => `data.${type}${search}`;
  const searchOf = (query?: Record<string, string>) =>
    query ? `?${new URLSearchParams(query).toString()}` : '';

  function cached<T>(cacheKey: string): DataResult<T> | null {
    const envelope = readCache<DataEnvelope<T>>(storage, cacheKey);
    if (!envelope || !(Date.now() - Date.parse(envelope.updatedAt) <= MAX_CACHED_AGE_MS)) return null;
    return { kind: 'ok', envelope, fromCache: true };
  }

  return {
    async load<T>(type: string, query?: Record<string, string>): Promise<DataResult<T>> {
      const token = getToken();
      if (token === null) return { kind: 'error', code: 'unauthorized' };
      const search = searchOf(query);
      const result = await request<T>(token, `/api/v1/data/${encodeURIComponent(type)}${search}`);
      if (result.kind === 'ok') {
        writeCache(storage, key(type, search), result.envelope);
        return result;
      }
      return (TRANSIENT_CODES.has(result.code) && cached<T>(key(type, search))) || result;
    },
    peek<T>(type: string, query?: Record<string, string>): DataResult<T> | null {
      return cached<T>(key(type, searchOf(query)));
    },
    async completeTask(sourceId, taskId, completed) {
      const token = getToken();
      if (token === null) return { kind: 'error', code: 'unauthorized' };
      const path = `/api/v1/tasks/${encodeURIComponent(sourceId)}/${encodeURIComponent(taskId)}`;
      const result = await request<unknown>(token, path, { method: 'PATCH', body: { completed } });
      return result.kind === 'ok' ? { kind: 'ok' } : result;
    },
  };
}
