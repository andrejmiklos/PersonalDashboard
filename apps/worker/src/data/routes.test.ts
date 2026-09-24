import type { DatabaseSync } from 'node:sqlite';
import type { AirData, AstroData, DataEnvelope, WeatherData } from '@dashboard/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../auth/token';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { forecastFixture } from '../test/open-meteo-forecast';

// Fictional tokens and location used only in tests.
const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;
const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;
const ORIGIN = 'https://dashboard.example.com';
const LOCATION = { label: 'Testville', lat: 50, lon: 10 };
const T0 = new Date('2026-01-15T13:15:00.000Z');

let db: DatabaseSync;
let env: Env;
const upstream = vi.fn<typeof fetch>();

async function call(method: string, path: string, init: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${init.token ?? DEVICE_TOKEN}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const req = new Request(`${ORIGIN}/api/v1${path}`, {
    method,
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
  return worker.fetch(req, env);
}

const getWeather = () => call('GET', '/data/weather');

async function setLocation(location: typeof LOCATION): Promise<void> {
  expect((await call('PUT', '/settings', { token: ADMIN_TOKEN, body: { location } })).status).toBe(200);
}

function advanceMinutes(n: number): void {
  vi.setSystemTime(new Date(T0.getTime() + n * 60_000));
}

describe('GET /api/v1/data/weather', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    upstream.mockReset();
    upstream.mockImplementation(async () => Response.json(forecastFixture()));
    vi.stubGlobal('fetch', upstream);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    db = migrate();
    env = { DB: createTestD1(db) } as unknown as Env;
    const insert = db.prepare(
      'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
    insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires a token', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/v1/data/weather`), env);
    expect(res.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 409 until a location is set', async () => {
    const res = await getWeather();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'location_not_set', message: expect.any(String) } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('fetches the forecast for the stored location and wraps it in the envelope', async () => {
    await setLocation(LOCATION);
    const res = await getWeather();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as DataEnvelope<WeatherData>;
    expect(body).toMatchObject({ updatedAt: T0.toISOString(), ttl: 900 });
    expect(body.stale).toBeUndefined();
    expect(body.data.current.temperature).toBe(3.4);

    const url = new URL(String(upstream.mock.calls[0]?.[0]));
    expect(url.searchParams.get('latitude')).toBe('50');
    expect(url.searchParams.get('longitude')).toBe('10');
    expect(url.searchParams.get('timezone')).toBe('Europe/Bratislava');
  });

  it('serves the cached payload within the TTL', async () => {
    await setLocation(LOCATION);
    await getWeather();
    advanceMinutes(14);
    const body = (await (await getWeather()).json()) as DataEnvelope<WeatherData>;
    expect(body.updatedAt).toBe(T0.toISOString());
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('calls the provider again after the TTL', async () => {
    await setLocation(LOCATION);
    await getWeather();
    advanceMinutes(16);
    const body = (await (await getWeather()).json()) as DataEnvelope<WeatherData>;
    expect(body.updatedAt).toBe(new Date(T0.getTime() + 16 * 60_000).toISOString());
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('fetches again when the location changes', async () => {
    await setLocation(LOCATION);
    await getWeather();
    await setLocation({ ...LOCATION, lat: 51 });
    await getWeather();
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('serves stale data while the provider fails, up to 3 hours', async () => {
    await setLocation(LOCATION);
    await getWeather();
    upstream.mockImplementation(async () => new Response('{"error":true}', { status: 500 }));

    advanceMinutes(180);
    const res = await getWeather();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ updatedAt: T0.toISOString(), ttl: 900, stale: true });

    advanceMinutes(181);
    const expired = await getWeather();
    expect(expired.status).toBe(503);
    expect(await expired.json()).toEqual({
      error: { code: 'provider_unavailable', message: expect.any(String) },
    });
  });

  it('answers 503 on a network error or an unusable body without a cached payload', async () => {
    await setLocation(LOCATION);
    upstream.mockRejectedValueOnce(new TypeError('network down'));
    expect((await getWeather()).status).toBe(503);
    upstream.mockResolvedValueOnce(Response.json({ current: {} }));
    expect((await getWeather()).status).toBe(503);
    upstream.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect((await getWeather()).status).toBe(503);
  });

  it('prunes rows outside the stale window on write', async () => {
    await setLocation(LOCATION);
    await getWeather();
    await setLocation({ ...LOCATION, lat: 51 });
    advanceMinutes(181);
    await getWeather();
    expect(db.prepare('SELECT COUNT(*) AS n FROM provider_cache').get()).toEqual({ n: 1 });
  });
});

describe('GET /api/v1/data/astro', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 23:30 UTC is already the next day in Europe/Bratislava.
    vi.setSystemTime(new Date('2026-09-23T23:30:00.000Z'));
    db = migrate();
    env = { DB: createTestD1(db) } as unknown as Env;
    const insert = db.prepare(
      'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
    insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers 409 until a location is set', async () => {
    const res = await call('GET', '/data/astro');
    expect(res.status).toBe(409);
  });

  it('computes today in the configured time zone', async () => {
    await setLocation(LOCATION);
    const res = await call('GET', '/data/astro');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DataEnvelope<AstroData>;
    expect(body).toMatchObject({ updatedAt: '2026-09-23T23:30:00.000Z', ttl: 21600 });
    expect(body.data.date).toBe('2026-09-24');
    expect(body.data.nextPhase).toEqual({ name: 'full', date: '2026-09-26' });
  });

  it('accepts an explicit date', async () => {
    await setLocation(LOCATION);
    const body = (await (await call('GET', '/data/astro?date=2026-12-21')).json()) as DataEnvelope<AstroData>;
    expect(body.data.date).toBe('2026-12-21');
  });

  it.each(['2026-02-30', '2026-9-24', '24.09.2026', '3026-01-01', ''])('rejects date=%s', async (date) => {
    await setLocation(LOCATION);
    const res = await call('GET', `/data/astro?date=${encodeURIComponent(date)}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: 'validation_error', message: 'date: expected YYYY-MM-DD' },
    });
  });
});

describe('GET /api/v1/data/air', () => {
  const upstreamAir = vi.fn<typeof fetch>();

  beforeEach(async () => {
    upstreamAir.mockReset();
    upstreamAir.mockImplementation(async () =>
      Response.json({ current: { time: '2026-01-15T14:00', european_aqi: 18, pm2_5: 4.6, pm10: 8.9 } }),
    );
    vi.stubGlobal('fetch', upstreamAir);
    db = migrate();
    env = { DB: createTestD1(db) } as unknown as Env;
    const insert = db.prepare(
      'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
    insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers 409 until a location is set', async () => {
    expect((await call('GET', '/data/air')).status).toBe(409);
    expect(upstreamAir).not.toHaveBeenCalled();
  });

  it('serves the air quality through the provider cache', async () => {
    await setLocation(LOCATION);
    const body = (await (await call('GET', '/data/air')).json()) as DataEnvelope<AirData>;
    expect(body).toMatchObject({ ttl: 3600, data: { aqi: 18, pm2_5: 4.6, pm10: 8.9 } });
    await call('GET', '/data/air');
    expect(upstreamAir).toHaveBeenCalledTimes(1);
    expect(new URL(String(upstreamAir.mock.calls[0]?.[0])).host).toBe('air-quality-api.open-meteo.com');
  });
});
