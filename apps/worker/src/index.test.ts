import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';

const env = {
  ASSETS: {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      return path === '/display/' ? new Response('<!doctype html>') : new Response('', { status: 404 });
    },
  },
} as unknown as Env;

function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://dashboard.example.com${path}`), env);
}

describe('worker', () => {
  it('answers /healthz', async () => {
    const res = await get('/healthz');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('redirects the root to the display app', async () => {
    const res = await get('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://dashboard.example.com/display/');
  });

  it('serves static assets', async () => {
    const res = await get('/display/');
    expect(res.status).toBe(200);
  });

  it('returns a JSON 404 for unknown paths', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
