-- Last normalised payload per provider request (docs/01-architecture.md §3.2).
-- Used instead of the Cache API, which does not reliably persist on *.workers.dev.
-- Holds only non-personal data (weather, air quality); rows older than the stale window are pruned on write.

CREATE TABLE provider_cache (
  key        TEXT PRIMARY KEY,       -- provider + version + normalised params
  payload    TEXT NOT NULL,          -- JSON of the normalised data
  fetched_at TEXT NOT NULL
);
