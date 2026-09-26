import type { DataClient, DataResult } from '@dashboard/tiles';
import type { DataEnvelope } from '@dashboard/shared';
import { ApiError, type Api } from '../api';
import { sampleEnvelope, type SampleContext } from './sample-data';

export type PreviewMode = 'sample' | 'real';

/** A payload this old is fetched again when the preview is rebuilt. */
const CACHE_MS = 60_000;

/**
 * The data source of the editor preview. `sample` answers with fictional payloads; `real` asks the Worker
 * with the admin token and keeps the answers for a minute, so that redrawing the preview after every edit
 * does not call the providers each time. Ticking a task in the preview never changes anything.
 */
export function createPreviewClient(
  mode: PreviewMode,
  api: Api,
  context: () => SampleContext,
  now: () => number = Date.now,
): DataClient {
  const cache = new Map<string, { envelope: DataEnvelope<unknown>; at: number }>();
  const searchOf = (query?: Record<string, string>) =>
    query ? `?${new URLSearchParams(query).toString()}` : '';
  const keyOf = (type: string, query?: Record<string, string>) => `${type}${searchOf(query)}`;

  function sample<T>(type: string, query?: Record<string, string>): DataResult<T> {
    const envelope = sampleEnvelope(type, query, context());
    return envelope
      ? { kind: 'ok', envelope: envelope as DataEnvelope<T> }
      : { kind: 'error', code: 'not_found' };
  }

  function cached<T>(key: string): DataResult<T> | null {
    const hit = cache.get(key);
    return hit && now() - hit.at < CACHE_MS
      ? { kind: 'ok', envelope: hit.envelope as DataEnvelope<T> }
      : null;
  }

  return {
    peek<T>(type: string, query?: Record<string, string>): DataResult<T> | null {
      return mode === 'sample' ? sample<T>(type, query) : cached<T>(keyOf(type, query));
    },
    async load<T>(type: string, query?: Record<string, string>): Promise<DataResult<T>> {
      if (mode === 'sample') return sample<T>(type, query);
      const key = keyOf(type, query);
      const hit = cached<T>(key);
      if (hit) return hit;
      try {
        const envelope = await api.get<DataEnvelope<T>>(
          `/api/v1/data/${encodeURIComponent(type)}${searchOf(query)}`,
        );
        cache.set(key, { envelope, at: now() });
        return { kind: 'ok', envelope };
      } catch (error) {
        return { kind: 'error', code: error instanceof ApiError && error.status > 0 ? error.code : null };
      }
    },
    async completeTask() {
      return { kind: 'ok' };
    },
  };
}
