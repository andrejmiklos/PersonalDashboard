-- Last normalised payloads that contain personal data (calendar events, tasks; docs/01-architecture.md §3.2).
-- Unlike provider_cache, the payload is sealed with AES-GCM (key: Worker secret TOKEN_ENC_KEY), so D1 never
-- holds readable event or task content. Rows older than the stale window are pruned on write and the whole
-- table is emptied when an account is deleted.

CREATE TABLE personal_cache (
  key         TEXT PRIMARY KEY,      -- provider + version + source + params
  payload_enc TEXT NOT NULL,         -- sealed JSON of the normalised data
  fetched_at  TEXT NOT NULL
);
