import type { MiddlewareHandler } from 'hono';
import type { AppEnv, Env } from '../env';
import { ApiError } from '../errors';

/**
 * Per-client-IP limit through a Workers Rate Limiting binding (docs/06-security-and-public-repo.md §6).
 * It protects D1 and the pairing codes; rejected requests still count as Worker invocations, so it
 * does not protect the request quota (that needs a WAF rule on a custom domain).
 *
 * Without the binding (local dev, tests, a plan without it) or when the limiter fails, requests pass:
 * tokens and pairing codes stay unguessable either way, the limit only curbs abuse.
 */
export function rateLimit(pick: (env: Env) => RateLimit | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter = pick(c.env);
    if (limiter) {
      let allowed = true;
      try {
        ({ success: allowed } = await limiter.limit({ key: c.req.header('CF-Connecting-IP') ?? 'unknown' }));
      } catch (err) {
        console.error(`rate limiter failed: ${err instanceof Error ? err.name : 'unknown'}`);
      }
      if (!allowed) {
        c.header('Retry-After', '60');
        throw new ApiError(429, 'rate_limited', 'Too many requests');
      }
    }
    await next();
  };
}
