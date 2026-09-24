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

export type PairResult = { kind: 'paired'; token: string } | { kind: 'invalid' } | { kind: 'failed' };

/** Exchanges a one-time pairing code for a device token. */
export async function pairWithCode(code: string): Promise<PairResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch('/api/v1/display/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (res.status === 400) return { kind: 'invalid' };
    if (res.status !== 201) return { kind: 'failed' };
    const { token } = (await res.json()) as { token?: unknown };
    return typeof token === 'string' ? { kind: 'paired', token } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
