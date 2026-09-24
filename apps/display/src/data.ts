import type { DataEnvelope } from '@dashboard/shared';

// Tile data layer (docs/01-architecture.md §2.2 and §5).

const REQUEST_TIMEOUT_MS = 10_000;

/** `code` is the API error code (e.g. `location_not_set`), or null for network and unexpected errors. */
export type DataResult<T> =
  { kind: 'ok'; envelope: DataEnvelope<T> } | { kind: 'error'; code: string | null };

/** Loads `GET /api/v1/data/<type>`; bound to the device token by the caller. */
export type DataClient = <T>(type: string) => Promise<DataResult<T>>;

export function createDataClient(getToken: () => string | null): DataClient {
  return async <T>(type: string): Promise<DataResult<T>> => {
    const token = getToken();
    if (token === null) return { kind: 'error', code: 'unauthorized' };
    // AbortSignal.timeout is Chrome 103+.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/v1/data/${encodeURIComponent(type)}`, {
        headers: { Authorization: `Bearer ${token}` },
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
  };
}

function errorCode(body: unknown): string | null {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : null;
}

/** Stale when the server says so or the payload is older than twice its TTL (docs/01-architecture.md §5). */
export function isStale(envelope: DataEnvelope<unknown>, now: number): boolean {
  return envelope.stale === true || now - Date.parse(envelope.updatedAt) > 2 * envelope.ttl * 1000;
}

export interface PollerOptions<T> {
  load: () => Promise<DataResult<T>>;
  onResult: (result: DataResult<T>) => void;
  intervalMs: number;
  /** First retry after a failure; doubles up to `intervalMs`. */
  retryMs: number;
}

/** Loads now, then every `intervalMs`; failures retry sooner with backoff. */
export function startPoller<T>(options: PollerOptions<T>): { stop(): void } {
  let timer: number | undefined;
  let stopped = false;
  let failures = 0;

  async function run(): Promise<void> {
    const result = await options.load();
    if (stopped) return;
    options.onResult(result);
    failures = result.kind === 'ok' ? 0 : failures + 1;
    timer = window.setTimeout(() => void run(), nextDelay(failures, options.retryMs, options.intervalMs));
  }

  void run();
  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
    },
  };
}

export function nextDelay(failures: number, retryMs: number, intervalMs: number): number {
  return failures === 0 ? intervalMs : Math.min(retryMs * 2 ** (failures - 1), intervalMs);
}
