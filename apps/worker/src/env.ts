import type { AuthInfo } from './auth/middleware';

/** Worker bindings; configured in wrangler.jsonc (template: wrangler.example.jsonc). */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Worker secret: 32 random bytes, base64. Seals provider tokens and personal payloads in D1. */
  TOKEN_ENC_KEY?: string;
  /** Optional Workers Rate Limiting bindings (wrangler.example.jsonc); skipped when missing. */
  API_LIMITER?: RateLimit;
  PAIR_LIMITER?: RateLimit;
}

/** Hono generic for handlers and middleware of this Worker. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    /** Set by requireAuth. */
    auth: AuthInfo;
  };
}
