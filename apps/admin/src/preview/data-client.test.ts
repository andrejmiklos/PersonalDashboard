import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../api';
import { createPreviewClient } from './data-client';
import type { SampleContext } from './sample-data';

const context = (): SampleContext => ({
  now: new Date('2026-01-15T10:00:00.000Z'),
  timezone: 'UTC',
  locale: 'en',
  sources: [],
});

function fakeApi(get: Api['get']): Api {
  return { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as Api;
}

const envelope = { updatedAt: '2026-01-15T09:59:00.000Z', ttl: 60, data: { x: 1 } };

describe('sample mode', () => {
  it('answers at once and never calls the API', async () => {
    const get = vi.fn();
    const client = createPreviewClient('sample', fakeApi(get as Api['get']), context);
    expect(client.peek('air')).toMatchObject({ kind: 'ok' });
    expect(await client.load('weather')).toMatchObject({ kind: 'ok' });
    expect(get).not.toHaveBeenCalled();
  });

  it('reports a type without sample data as an error', async () => {
    const client = createPreviewClient('sample', fakeApi(vi.fn() as Api['get']), context);
    expect(await client.load('clock')).toEqual({ kind: 'error', code: 'not_found' });
  });
});

describe('real mode', () => {
  it('asks the Worker with the query and remembers the answer for a minute', async () => {
    const get = vi.fn(async () => envelope);
    let time = 1_000_000;
    const client = createPreviewClient('real', fakeApi(get as Api['get']), context, () => time);

    expect(client.peek('calendar', { sources: 'src_a', days: '3' })).toBeNull();
    const first = await client.load('calendar', { sources: 'src_a', days: '3' });
    expect(first).toEqual({ kind: 'ok', envelope });
    expect(get).toHaveBeenCalledWith('/api/v1/data/calendar?sources=src_a&days=3');

    time += 30_000;
    await client.load('calendar', { sources: 'src_a', days: '3' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(client.peek('calendar', { sources: 'src_a', days: '3' })).toEqual({ kind: 'ok', envelope });

    time += 31_000;
    await client.load('calendar', { sources: 'src_a', days: '3' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('has no query string for a tile without one', async () => {
    const get = vi.fn(async () => envelope);
    await createPreviewClient('real', fakeApi(get as Api['get']), context).load('weather');
    expect(get).toHaveBeenCalledWith('/api/v1/data/weather');
  });

  it('passes on the error code of the API, and null for an unreachable server', async () => {
    const refused = vi.fn(async () => {
      throw new ApiError(409, 'location_not_set', 'no');
    });
    expect(
      await createPreviewClient('real', fakeApi(refused as Api['get']), context).load('weather'),
    ).toEqual({
      kind: 'error',
      code: 'location_not_set',
    });

    const offline = vi.fn(async () => {
      throw new ApiError(0, 'network', 'offline');
    });
    expect(
      await createPreviewClient('real', fakeApi(offline as Api['get']), context).load('weather'),
    ).toEqual({
      kind: 'error',
      code: null,
    });
  });

  it('does not cache a failure', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'provider_unavailable', 'x'))
      .mockResolvedValueOnce(envelope);
    const client = createPreviewClient('real', fakeApi(get as Api['get']), context);
    expect((await client.load('air')).kind).toBe('error');
    expect((await client.load('air')).kind).toBe('ok');
  });
});

describe('completing a task', () => {
  it('is accepted but changes nothing in either mode', async () => {
    for (const mode of ['sample', 'real'] as const) {
      const api = fakeApi(vi.fn() as Api['get']);
      const client = createPreviewClient(mode, api, context);
      expect(await client.completeTask('src_a', 't1', true)).toEqual({ kind: 'ok' });
      expect(api.put).not.toHaveBeenCalled();
    }
  });
});
