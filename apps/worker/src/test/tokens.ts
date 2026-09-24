import type { DatabaseSync } from 'node:sqlite';
import { hashToken } from '../auth/token';

// Fictional tokens used only in tests.
export const ADMIN_TOKEN = `dsh_admin_${'A'.repeat(43)}`;
export const DEVICE_TOKEN = `dsh_device_${'B'.repeat(43)}`;

/** Inserts ADMIN_TOKEN (`tok_admin`) and DEVICE_TOKEN (`tok_device`) as active tokens. */
export async function seedTokens(db: DatabaseSync): Promise<void> {
  const insert = db.prepare(
    'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run('tok_admin', 'admin', 'test', await hashToken(ADMIN_TOKEN), '2026-01-15T08:00:00.000Z');
  insert.run('tok_device', 'device', 'test', await hashToken(DEVICE_TOKEN), '2026-01-15T08:00:00.000Z');
}
