import { HTTPException } from 'hono/http-exception';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import type { Env } from './env';
import { ApiError } from './errors';

const app = createApp();
app.get('/ok', (c) => c.json({ ok: true }));
app.get('/api-error', () => {
  throw new ApiError(409, 'conflict', 'Version mismatch');
});
app.get('/http-exception', () => {
  throw new HTTPException(400, { message: 'Malformed JSON' });
});
app.get('/crash', () => {
  throw new Error('secret detail from a provider');
});

async function get(path: string): Promise<Response> {
  return app.request(path, {}, {} as Env);
}

describe('createApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets security and cache headers on every response', async () => {
    for (const path of ['/ok', '/nope']) {
      const res = await get(path);
      expect(res.headers.get('Content-Security-Policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('maps ApiError to its status and uniform body', async () => {
    const res = await get('/api-error');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'conflict', message: 'Version mismatch' } });
  });

  it('maps Hono HTTPException to a uniform body', async () => {
    const res = await get('/http-exception');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: 'bad_request', message: 'Malformed JSON' } });
  });

  it('hides unexpected errors from the client', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await get('/crash');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 'internal_error', message: 'Internal error' } });
  });
});
