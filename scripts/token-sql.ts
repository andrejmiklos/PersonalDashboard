import { generateToken, hashToken, ROLES, type Role } from '../apps/worker/src/auth/token.ts';
import { generateId, ID_PATTERN } from '../apps/worker/src/ids.ts';

// Letters (incl. Slovak diacritics), digits, space, dot, underscore, hyphen; no quotes.
const LABEL_PATTERN = /^[\p{L}\p{N} ._-]{1,64}$/u;

export const LIST_SQL =
  'SELECT id, role, label, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at';

/** SQL string literal. Inputs are whitelisted before this; escaping is a second guard. */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function validateLabel(label: string | undefined): string {
  if (label === undefined || !LABEL_PATTERN.test(label)) {
    throw new Error('--label must be 1-64 letters, digits, spaces, dots, underscores or hyphens');
  }
  return label;
}

export interface CreatePlan {
  id: string;
  role: Role;
  token: string;
  sql: string;
}

export async function planCreate(
  role: string | undefined,
  label: string | undefined,
  now: Date,
): Promise<CreatePlan> {
  if (!ROLES.includes(role as Role)) {
    throw new Error(`--role must be one of: ${ROLES.join(', ')}`);
  }
  const validLabel = validateLabel(label);
  const validRole = role as Role;
  const id = generateId('tok');
  const token = generateToken(validRole);
  const values = [id, validRole, validLabel, await hashToken(token), now.toISOString()]
    .map(sqlString)
    .join(', ');
  const sql = `INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (${values}) RETURNING id`;
  return { id, role: validRole, token, sql };
}

export function planRevoke(id: string | undefined, now: Date): string {
  if (id === undefined || !ID_PATTERN.test(id) || !id.startsWith('tok_')) {
    throw new Error('Expected a token id such as tok_abcdefghijklmnop');
  }
  return `UPDATE api_tokens SET revoked_at = ${sqlString(now.toISOString())} WHERE id = ${sqlString(id)} AND revoked_at IS NULL RETURNING id`;
}
