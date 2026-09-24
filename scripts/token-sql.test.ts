import { describe, expect, it } from 'vitest';
import { hashToken, parseTokenRole } from '../apps/worker/src/auth/token.ts';
import { migrate } from '../apps/worker/src/test/d1.ts';
import { planCreate, planRevoke } from './token-sql.ts';

const NOW = new Date('2026-01-15T08:00:00.000Z');

describe('planCreate', () => {
  it('stores only the hash of a valid new token', async () => {
    const db = migrate();
    const plan = await planCreate('device', 'Kitchen tablet ľščť', NOW);

    expect(parseTokenRole(plan.token)).toBe('device');
    expect(plan.sql).not.toContain(plan.token);
    expect(db.prepare(plan.sql).all()).toEqual([{ id: plan.id }]);
    expect(db.prepare('SELECT id, role, label, token_hash, created_at FROM api_tokens').get()).toEqual({
      id: plan.id,
      role: 'device',
      label: 'Kitchen tablet ľščť',
      token_hash: await hashToken(plan.token),
      created_at: NOW.toISOString(),
    });
  });

  it.each([
    ['unknown role', 'root', 'label'],
    ['missing role', undefined, 'label'],
    ['missing label', 'admin', undefined],
    ['empty label', 'admin', ''],
    ['label with a quote', 'admin', "x'); DROP TABLE api_tokens; --"],
    ['too long label', 'admin', 'x'.repeat(65)],
  ])('rejects %s', async (_name, role, label) => {
    await expect(planCreate(role, label, NOW)).rejects.toThrow();
  });
});

describe('planRevoke', () => {
  it('revokes only an active token', async () => {
    const db = migrate();
    const plan = await planCreate('admin', 'owner', NOW);
    db.exec(plan.sql);

    const sql = planRevoke(plan.id, NOW);
    expect(db.prepare(sql).all()).toEqual([{ id: plan.id }]);
    expect(db.prepare(sql).all()).toEqual([]);
    expect(db.prepare('SELECT revoked_at FROM api_tokens').get()).toEqual({ revoked_at: NOW.toISOString() });
  });

  it.each([undefined, '', 'tok_short', "tok_abcdefghijklmnop' OR '1'='1", 'lay_abcdefghijklmnop'])(
    'rejects id %j',
    (id) => {
      expect(() => planRevoke(id, NOW)).toThrow();
    },
  );
});
