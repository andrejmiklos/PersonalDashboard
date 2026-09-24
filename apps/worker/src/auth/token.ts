export const ROLES = ['admin', 'device'] as const;
export type Role = (typeof ROLES)[number];

/** `dsh_<role>_<43 chars base64url of 32 random bytes>` (docs/06-security-and-public-repo.md §2). */
const TOKEN_PATTERN = /^dsh_(admin|device)_[A-Za-z0-9_-]{43}$/;

/** New random token; shown to the owner once, only its hash is stored. */
export function generateToken(role: Role): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64url = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `dsh_${role}_${base64url}`;
}

/** Returns the role encoded in a well-formed token, or null for anything else. */
export function parseTokenRole(token: string): Role | null {
  const match = TOKEN_PATTERN.exec(token);
  return match ? (match[1] as Role) : null;
}

/** Hex SHA-256 of the token; only this is stored in D1. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two strings in time that depends only on their length.
 * crypto.subtle.timingSafeEqual exists only in Workers, not in Node where tests run.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
