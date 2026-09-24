import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { ApiError, handleError, handleNotFound } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Hono app with the middleware shared by every Worker route.
 * Static assets never reach it; their headers come from apps/worker/public/_headers.
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(
    secureHeaders({
      // The Worker only answers with JSON and redirects, so nothing may be loaded or framed.
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
      permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
    }),
  );
  app.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });
  // Browsers send Origin on state-changing requests; only our own origin may change state.
  // Requests without Origin (curl, scripts) still need a bearer token.
  app.use(async (c, next) => {
    const origin = c.req.header('Origin');
    if (!SAFE_METHODS.has(c.req.method) && origin !== undefined && origin !== new URL(c.req.url).origin) {
      throw new ApiError(403, 'forbidden_origin', 'Cross-origin request rejected');
    }
    await next();
  });

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}
