import { zonedParts, type DataEnvelope } from '@dashboard/shared';

// Tile data contract and polling helpers (docs/01-architecture.md §2.2 and §5).

/**
 * `code` is the API error code (e.g. `location_not_set`), or null for network and unexpected errors.
 * `fromCache` marks the last stored payload served because the request failed.
 */
export type DataResult<T> =
  { kind: 'ok'; envelope: DataEnvelope<T>; fromCache?: true } | { kind: 'error'; code: string | null };

/** Outcome of a change made through the API; `code` as in {@link DataResult}. */
export type ChangeResult = { kind: 'ok' } | { kind: 'error'; code: string | null };

/** `GET /api/v1/data/<type>?<query>`, bound to the device token and the offline copy. */
export interface DataClient {
  load<T>(type: string, query?: Record<string, string>): Promise<DataResult<T>>;
  /** The stored payload, without a request; null when there is none or it is too old. */
  peek<T>(type: string, query?: Record<string, string>): DataResult<T> | null;
  /** Completes or reopens a task (`PATCH /api/v1/tasks/:sourceId/:taskId`), the tablet's only write. */
  completeTask(sourceId: string, taskId: string, completed: boolean): Promise<ChangeResult>;
}

/** Stale when the server says so or the payload is older than twice its TTL (docs/01-architecture.md §5). */
export function isStale(envelope: DataEnvelope<unknown>, now: number): boolean {
  return envelope.stale === true || now - Date.parse(envelope.updatedAt) > 2 * envelope.ttl * 1000;
}

export interface PollerOptions<T> {
  load: () => Promise<DataResult<T>>;
  /** Shown at once, before the first request answers (the offline copy). */
  peek?: () => DataResult<T> | null;
  onResult: (result: DataResult<T>) => void;
  /** A function is asked again before every wait, e.g. to also refresh at midnight. */
  intervalMs: number | (() => number);
  /** First retry after a failure; doubles up to `intervalMs`. */
  retryMs: number;
}

/**
 * Loads now, then every `intervalMs`; failures (also answered from the cache) retry sooner with
 * backoff, and at once when the browser reports it is online again.
 */
export function startPoller<T>(options: PollerOptions<T>): { stop(): void } {
  let timer: number | undefined;
  let stopped = false;
  let running = false;
  let failures = 0;

  async function run(): Promise<void> {
    window.clearTimeout(timer);
    running = true;
    const result = await options.load();
    running = false;
    if (stopped) return;
    options.onResult(result);
    failures = result.kind === 'ok' && !result.fromCache ? 0 : failures + 1;
    const interval = typeof options.intervalMs === 'function' ? options.intervalMs() : options.intervalMs;
    timer = window.setTimeout(() => void run(), nextDelay(failures, options.retryMs, interval));
  }

  function onOnline(): void {
    if (failures > 0 && !running) void run();
  }

  const initial = options.peek?.();
  if (initial) options.onResult(initial);
  window.addEventListener('online', onOnline);
  void run();
  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    },
  };
}

const DAY_MS = 86_400_000;

/** Milliseconds until the wall clock in `timeZone` next shows `hour:minute` (always > 0). */
export function msUntilLocalTime(now: Date, timeZone: string, hour: number, minute: number): number {
  const p = zonedParts(now, timeZone);
  const sinceMidnight = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + now.getMilliseconds();
  const diff = (hour * 60 + minute) * 60_000 - sinceMidnight;
  return diff > 0 ? diff : diff + DAY_MS;
}

/** Milliseconds until the next local midnight in `timeZone`, plus a minute of margin. */
export function msUntilMidnight(now: Date, timeZone: string): number {
  return msUntilLocalTime(now, timeZone, 0, 0) + 60_000;
}

export function nextDelay(failures: number, retryMs: number, intervalMs: number): number {
  return failures === 0 ? intervalMs : Math.min(retryMs * 2 ** (failures - 1), intervalMs);
}
