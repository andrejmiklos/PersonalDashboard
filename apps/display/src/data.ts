import { zonedParts, type DataEnvelope } from '@dashboard/shared';

// Tile data layer (docs/01-architecture.md §2.2 and §5).

const REQUEST_TIMEOUT_MS = 10_000;

/** `code` is the API error code (e.g. `location_not_set`), or null for network and unexpected errors. */
export type DataResult<T> =
  { kind: 'ok'; envelope: DataEnvelope<T> } | { kind: 'error'; code: string | null };

/** Loads `GET /api/v1/data/<type>?<query>`; bound to the device token by the caller. */
export type DataClient = <T>(type: string, query?: Record<string, string>) => Promise<DataResult<T>>;

export function createDataClient(getToken: () => string | null): DataClient {
  return async <T>(type: string, query?: Record<string, string>): Promise<DataResult<T>> => {
    const token = getToken();
    if (token === null) return { kind: 'error', code: 'unauthorized' };
    // AbortSignal.timeout is Chrome 103+.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const search = query ? `?${new URLSearchParams(query).toString()}` : '';
      const res = await fetch(`/api/v1/data/${encodeURIComponent(type)}${search}`, {
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
  /** A function is asked again before every wait, e.g. to also refresh at midnight. */
  intervalMs: number | (() => number);
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
    const interval = typeof options.intervalMs === 'function' ? options.intervalMs() : options.intervalMs;
    timer = window.setTimeout(() => void run(), nextDelay(failures, options.retryMs, interval));
  }

  void run();
  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
    },
  };
}

const DAY_MS = 86_400_000;

/** Milliseconds until the next local midnight in `timeZone`, plus a minute of margin. */
export function msUntilMidnight(now: Date, timeZone: string): number {
  const p = zonedParts(now, timeZone);
  const sinceMidnight = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + now.getMilliseconds();
  return DAY_MS - sinceMidnight + 60_000;
}

export function nextDelay(failures: number, retryMs: number, intervalMs: number): number {
  return failures === 0 ? intervalMs : Math.min(retryMs * 2 ** (failures - 1), intervalMs);
}
