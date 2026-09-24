import type { AuthInfo } from './auth/middleware';

/** Worker bindings; configured in wrangler.jsonc (template: wrangler.example.jsonc). */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

/** Hono generic for handlers and middleware of this Worker. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    /** Set by requireAuth. */
    auth: AuthInfo;
  };
}
