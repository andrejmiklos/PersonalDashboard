import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './env';
import { handleError, handleNotFound } from './errors';

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

  app.onError(handleError);
  app.notFound(handleNotFound);
  return app;
}
