import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataClient, isStale, nextDelay } from './data';

// Fictional token used only in tests.
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;

describe('createDataClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the device token and returns the envelope', async () => {
    const envelope = { updatedAt: '2026-01-15T13:15:00.000Z', ttl: 900, data: { x: 1 } };
    const fetchMock = vi.fn(async () => Response.json(envelope));
    vi.stubGlobal('fetch', fetchMock);

    expect(await createDataClient(() => DEVICE_TOKEN)('weather')).toEqual({ kind: 'ok', envelope });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/data/weather');
    expect(init.headers).toEqual({ Authorization: `Bearer ${DEVICE_TOKEN}` });
    expect(init.credentials).toBe('omit');
  });

  it('returns the API error code', async () => {
    const body = { error: { code: 'location_not_set', message: 'Set a location' } };
    vi.stubGlobal('fetch', async () => Response.json(body, { status: 409 }));
    expect(await createDataClient(() => DEVICE_TOKEN)('weather')).toEqual({
      kind: 'error',
      code: 'location_not_set',
    });
  });

  it('folds network errors and non-JSON bodies into a null code', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await createDataClient(() => DEVICE_TOKEN)('weather')).toEqual({ kind: 'error', code: null });
    vi.stubGlobal('fetch', async () => new Response('<html>', { status: 502 }));
    expect(await createDataClient(() => DEVICE_TOKEN)('weather')).toEqual({ kind: 'error', code: null });
  });

  it('does not call the server without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await createDataClient(() => null)('weather')).toEqual({ kind: 'error', code: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
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
