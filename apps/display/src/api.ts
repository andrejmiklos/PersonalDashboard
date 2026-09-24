import type { DisplayState } from '@dashboard/shared';

const REQUEST_TIMEOUT_MS = 10_000;

export type StateResult =
  | { kind: 'changed'; state: DisplayState; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'unauthorized' }
  | { kind: 'failed' };

/**
 * Fetches the display state from the same origin. Every failure is folded into a result so the
 * polling loop never throws; response bodies are never logged.
 */
export async function fetchState(token: string, etag: string | null): Promise<StateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (etag !== null) headers['If-None-Match'] = etag;
    const res = await fetch('/api/v1/display/state', {
      headers,
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (res.status === 304) return { kind: 'unchanged' };
    if (res.status === 401) return { kind: 'unauthorized' };
    if (!res.ok) return { kind: 'failed' };
    return { kind: 'changed', state: (await res.json()) as DisplayState, etag: res.headers.get('ETag') };
  } catch {
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
