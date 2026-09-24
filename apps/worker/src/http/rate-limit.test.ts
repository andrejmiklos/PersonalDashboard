import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1 } from '../test/d1';

const ORIGIN = 'https://dashboard.example.com';

function limiter(allow: (key: string) => boolean): RateLimit & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key);
      return { success: allow(key) };
    },
  };
}

function pair(env: Env, ip = '203.0.113.7') {
  return worker.fetch(
    new Request(`${ORIGIN}/api/v1/display/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ code: 'AAAA-AAAA' }),
    }),
    env,
  );
}

describe('rate limiting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 429 with Retry-After when the pairing limit is reached, keyed by client IP', async () => {
    const pairLimiter = limiter(() => false);
    const env = { DB: createTestD1(), PAIR_LIMITER: pairLimiter } as unknown as Env;
    const res = await pair(env);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests' } });
    expect(pairLimiter.keys).toEqual(['203.0.113.7']);
  });

  it('limits every API request with the general limiter before authentication', async () => {
    const env = { DB: createTestD1(), API_LIMITER: limiter(() => false) } as unknown as Env;
    const res = await worker.fetch(new Request(`${ORIGIN}/api/v1/display/state`), env);
    expect(res.status).toBe(429);
  });

  it('lets requests through when allowed, without a binding, or when the limiter fails', async () => {
    const allowed = { DB: createTestD1(), PAIR_LIMITER: limiter(() => true) } as unknown as Env;
    expect((await pair(allowed)).status).toBe(400);

    const missing = { DB: createTestD1() } as unknown as Env;
    expect((await pair(missing)).status).toBe(400);

    const broken: RateLimit = {
      limit: async () => {
        throw new Error('limiter down');
      },
    };
    const failing = { DB: createTestD1(), PAIR_LIMITER: broken } as unknown as Env;
    expect((await pair(failing)).status).toBe(400);
  });

  it('does not limit /healthz', async () => {
    const env = { DB: createTestD1(), API_LIMITER: limiter(() => false) } as unknown as Env;
    expect((await worker.fetch(new Request(`${ORIGIN}/healthz`), env)).status).toBe(200);
  });
});
