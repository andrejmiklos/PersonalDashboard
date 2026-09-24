import { describe, expect, it } from 'vitest';
import worker from './index';
import type { Env } from './env';

const env = {} as Env;

async function get(path: string): Promise<Response> {
  return worker.fetch(new Request(`https://dashboard.example.com${path}`), env);
}

describe('worker routes', () => {
  it('answers /healthz', async () => {
    const res = await get('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('redirects the root to the display app', async () => {
    const res = await get('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/display/');
  });

  it('returns a JSON 404 for unknown paths', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
