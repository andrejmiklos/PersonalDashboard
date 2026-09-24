-- One-time pairing codes for displays (docs/06-security-and-public-repo.md §2.1).
-- Only the SHA-256 of a code is stored; a code is valid once, for 10 minutes, and
-- stops working after too many failed pairing attempts.

CREATE TABLE pairing_codes (
  code_hash       TEXT PRIMARY KEY,
  label           TEXT NOT NULL,     -- becomes the label of the issued device token
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  used_at         TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0
);
