import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isStale, msUntilLocalTime, msUntilMidnight, nextDelay, startPoller, type DataResult } from './data';

describe('startPoller', () => {
  type Listener = () => void;
  let listeners: Map<string, Listener>;
  let timeouts: { fn: () => void; ms: number }[];

  beforeEach(() => {
    listeners = new Map();
    timeouts = [];
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void, ms: number) => timeouts.push({ fn, ms }),
      clearTimeout: () => undefined,
      addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const ok: DataResult<number> = { kind: 'ok', envelope: { updatedAt: '', ttl: 1, data: 1 } };
  const cached: DataResult<number> = { ...ok, fromCache: true };

  it('shows the offline copy first, then the fresh result', async () => {
    const seen: DataResult<number>[] = [];
    startPoller({
      load: async () => ok,
      peek: () => cached,
      onResult: (r) => seen.push(r),
      intervalMs: 900_000,
      retryMs: 60_000,
    });
    expect(seen).toEqual([cached]);
    await flush();
    expect(seen).toEqual([cached, ok]);
    expect(timeouts.at(-1)?.ms).toBe(900_000);
  });

  it('keeps retrying soon while it only gets the cached copy', async () => {
    startPoller({
      load: async () => cached,
      onResult: () => undefined,
      intervalMs: 900_000,
      retryMs: 60_000,
    });
    await flush();
    expect(timeouts.at(-1)?.ms).toBe(60_000);
  });

  it('retries at once when the browser is online again', async () => {
    const load = vi.fn(async () => cached);
    const poller = startPoller({ load, onResult: () => undefined, intervalMs: 900_000, retryMs: 60_000 });
    await flush();
    listeners.get('online')?.();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    poller.stop();
    expect(listeners.has('online')).toBe(false);
  });
});

describe('isStale', () => {
  const updatedAt = '2026-01-15T13:00:00.000Z';
  const at = (minutes: number) => Date.parse(updatedAt) + minutes * 60_000;

  it('is stale after twice the TTL', () => {
    expect(isStale({ updatedAt, ttl: 900, data: null }, at(30))).toBe(false);
    expect(isStale({ updatedAt, ttl: 900, data: null }, at(31))).toBe(true);
  });

  it('is stale when the server serves an old payload', () => {
    expect(isStale({ updatedAt, ttl: 900, stale: true, data: null }, at(0))).toBe(true);
  });
});

describe('nextDelay', () => {
  it('polls at the interval and backs off from the retry delay after failures', () => {
    const minute = 60_000;
    expect(nextDelay(0, minute, 15 * minute)).toBe(15 * minute);
    expect([1, 2, 3, 4, 5].map((n) => nextDelay(n, minute, 15 * minute) / minute)).toEqual([1, 2, 4, 8, 15]);
  });
});

describe('local time helpers', () => {
  // 22:30 in Bratislava (UTC+2 in summer).
  const now = new Date('2026-09-24T20:30:00.000Z');

  it('counts to the next local midnight plus a minute', () => {
    expect(msUntilMidnight(now, 'Europe/Bratislava')).toBe(91 * 60_000);
  });

  it('counts to the next 03:30, tomorrow when it has passed today', () => {
    expect(msUntilLocalTime(now, 'Europe/Bratislava', 3, 30)).toBe(5 * 60 * 60_000);
    expect(msUntilLocalTime(now, 'Europe/Bratislava', 22, 30)).toBe(24 * 60 * 60_000);
  });
});
