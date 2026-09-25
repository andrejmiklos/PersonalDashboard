-- Short-lived credentials per account (docs/05-integrations.md §1.3, docs/06-security-and-public-repo.md §8).
-- The access token is sealed like the refresh token (AES-GCM, key from the Worker secret TOKEN_ENC_KEY).
-- refresh_lock_until serialises refreshes of one account: providers such as Microsoft rotate refresh tokens,
-- so two concurrent refreshes must not both spend the same token.

ALTER TABLE accounts ADD COLUMN access_token_enc TEXT;
ALTER TABLE accounts ADD COLUMN access_expires_at TEXT;
ALTER TABLE accounts ADD COLUMN refresh_lock_until TEXT;
