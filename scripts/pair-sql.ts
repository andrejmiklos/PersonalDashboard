import { sha256Hex } from '../apps/worker/src/auth/token.ts';
import { generatePairingCode, PAIRING_TTL_MS } from '../apps/worker/src/display/pairing-code.ts';
import { sqlString, validateLabel } from './token-sql.ts';

export interface PairPlan {
  code: string;
  codeHash: string;
  expiresAt: Date;
  /** Run in order: drop other unused codes (only one is active), then insert the new one. */
  statements: [string, string];
}

export async function planPair(label: string | undefined, now: Date): Promise<PairPlan> {
  const validLabel = validateLabel(label);
  const code = generatePairingCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const values = [codeHash, validLabel, now.toISOString(), expiresAt.toISOString()].map(sqlString).join(', ');
  return {
    code,
    codeHash,
    expiresAt,
    statements: [
      `DELETE FROM pairing_codes WHERE used_at IS NULL OR used_at < ${sqlString(dayAgo)}`,
      `INSERT INTO pairing_codes (code_hash, label, created_at, expires_at) VALUES (${values}) RETURNING code_hash`,
    ],
  };
}
