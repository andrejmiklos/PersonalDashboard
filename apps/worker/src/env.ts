/** Worker bindings; configured in wrangler.jsonc (template: wrangler.example.jsonc). */
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

/** Hono generic for handlers and middleware of this Worker. */
export interface AppEnv {
  Bindings: Env;
}
