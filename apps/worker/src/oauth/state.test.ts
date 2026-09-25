import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestD1, migrate } from '../test/d1';
import { codeChallenge } from './pkce';
import { consumeOAuthState, createOAuthState, OAUTH_STATE_TTL_MS } from './state';

const NOW = new Date('2026-01-15T08:00:00.000Z');

let sqlite: DatabaseSync;
let db: D1Database;

beforeEach(() => {
  sqlite = migrate();
  db = createTestD1(sqlite);
});

describe('codeChallenge', () => {
  it('matches the S256 example of RFC 7636 appendix B', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('OAuth state', () => {
  it('issues a random state and verifier and stores only the hash of the state', async () => {
    const a = await createOAuthState(db, 'google', NOW);
    const b = await createOAuthState(db, 'google', NOW);
    expect(a.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.state).not.toBe(b.state);

    const rows = sqlite.prepare('SELECT state FROM oauth_states').all() as { state: string }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.state)).not.toContain(a.state);
  });

  it('returns the verifier once', async () => {
    const { state, verifier } = await createOAuthState(db, 'google', NOW);
    expect(await consumeOAuthState(db, 'google', state, NOW)).toBe(verifier);
    expect(await consumeOAuthState(db, 'google', state, NOW)).toBeNull();
  });

  it('rejects unknown, malformed and foreign states, and burns a state used for another provider', async () => {
    const { state } = await createOAuthState(db, 'google', NOW);
    expect(await consumeOAuthState(db, 'google', 'x'.repeat(43), NOW)).toBeNull();
    expect(await consumeOAuthState(db, 'google', 'short', NOW)).toBeNull();
    expect(await consumeOAuthState(db, 'google', '', NOW)).toBeNull();
    expect(await consumeOAuthState(db, 'microsoft', state, NOW)).toBeNull();
    expect(await consumeOAuthState(db, 'google', state, NOW)).not.toBeNull();
  });

  it('expires after ten minutes', async () => {
    const { state } = await createOAuthState(db, 'microsoft', NOW);
    const late = new Date(NOW.getTime() + OAUTH_STATE_TTL_MS);
    expect(await consumeOAuthState(db, 'microsoft', state, late)).toBeNull();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get()).toEqual({ n: 0 });
  });

  it('prunes expired attempts when a new one starts', async () => {
    await createOAuthState(db, 'google', NOW);
    await createOAuthState(db, 'google', new Date(NOW.getTime() + OAUTH_STATE_TTL_MS + 1));
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM oauth_states').get()).toEqual({ n: 1 });
  });
});
