import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, readCache, writeCache } from './cache';
import {
  createDataClient,
  isStale,
  msUntilLocalTime,
  msUntilMidnight,
  nextDelay,
  startPoller,
  type DataResult,
} from './data';

// Fictional token used only in tests.
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const NOW = Date.parse('2026-01-15T13:15:00.000Z');

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const envelope = (minutesAgo = 0) => ({
  updatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  ttl: 900,
  data: { x: 1 },
});

describe('createDataClient', () => {
  let storage: Storage;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    storage = memoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends the device token, returns the envelope and keeps a copy', async () => {
    const fetchMock = vi.fn(async () => Response.json(envelope()));
    vi.stubGlobal('fetch', fetchMock);

    const client = createDataClient(() => DEVICE_TOKEN, storage);
    expect(await client.load('weather')).toEqual({ kind: 'ok', envelope: envelope() });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/data/weather');
    expect(init.headers).toEqual({ Authorization: `Bearer ${DEVICE_TOKEN}` });
    expect(init.credentials).toBe('omit');
    expect(client.peek('weather')).toEqual({ kind: 'ok', envelope: envelope(), fromCache: true });
  });

  it('appends query parameters and keeps copies per query', async () => {
    const fetchMock = vi.fn(async () => Response.json(envelope()));
    vi.stubGlobal('fetch', fetchMock);
    const client = createDataClient(() => DEVICE_TOKEN, storage);
    await client.load('quote', { lang: 'en' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/v1/data/quote?lang=en');
    expect(client.peek('quote', { lang: 'en' })).not.toBeNull();
    expect(client.peek('quote', { lang: 'sk' })).toBeNull();
  });

  it('serves the copy when the network or the provider fails', async () => {
    writeCache(storage, 'data.weather', envelope(60));
    const client = createDataClient(() => DEVICE_TOKEN, storage);

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await client.load('weather')).toEqual({ kind: 'ok', envelope: envelope(60), fromCache: true });

    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'provider_unavailable', message: 'x' } }, { status: 503 }),
    );
    expect(await client.load('weather')).toMatchObject({ kind: 'ok', fromCache: true });
  });

  it('does not hide errors that are about the request itself', async () => {
    writeCache(storage, 'data.weather', envelope(60));
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'location_not_set', message: 'x' } }, { status: 409 }),
    );
    expect(await createDataClient(() => DEVICE_TOKEN, storage).load('weather')).toEqual({
      kind: 'error',
      code: 'location_not_set',
    });
  });

  it('forgets copies older than a day', async () => {
    writeCache(storage, 'data.weather', envelope(25 * 60));
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 502 }));
    const client = createDataClient(() => DEVICE_TOKEN, storage);
    expect(await client.load('weather')).toEqual({ kind: 'error', code: null });
    expect(client.peek('weather')).toBeNull();
  });

  it('does not call the server without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await createDataClient(() => null, storage).load('weather')).toEqual({
      kind: 'error',
      code: 'unauthorized',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createDataClient completeTask', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('patches the task with the device token and sends only the completed flag', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 't=' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createDataClient(() => DEVICE_TOKEN, memoryStorage());
    expect(await client.completeTask('src_abc', 'AAMk=/x', true)).toEqual({ kind: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/tasks/src_abc/AAMk%3D%2Fx');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"completed":true}');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${DEVICE_TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(init.credentials).toBe('omit');
  });

  it('reports the error code of a refusal and network failures as null', async () => {
    const client = createDataClient(() => DEVICE_TOKEN, memoryStorage());
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: { code: 'reauth_required' } }, { status: 409 }),
    );
    expect(await client.completeTask('src_abc', 't1', false)).toEqual({
      kind: 'error',
      code: 'reauth_required',
    });

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await client.completeTask('src_abc', 't1', false)).toEqual({ kind: 'error', code: null });
  });

  it('does not call the server without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await createDataClient(() => null, memoryStorage()).completeTask('s', 't', true)).toEqual({
      kind: 'error',
      code: 'unauthorized',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('cache', () => {
  it('clears only its own keys', () => {
    const storage = memoryStorage();
    storage.setItem('dashboard.deviceToken', 'kept');
    writeCache(storage, 'state', { a: 1 });
    writeCache(storage, 'data.weather', { b: 2 });
    clearCache(storage);
    expect(readCache(storage, 'state')).toBeNull();
    expect(readCache(storage, 'data.weather')).toBeNull();
    expect(storage.getItem('dashboard.deviceToken')).toBe('kept');
  });

  it('survives missing storage and broken entries', () => {
    expect(readCache(null, 'state')).toBeNull();
    expect(() => writeCache(null, 'state', {})).not.toThrow();
    const storage = memoryStorage();
    storage.setItem('dashboard.cache.state', '{broken');
    expect(readCache(storage, 'state')).toBeNull();
  });
});

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
