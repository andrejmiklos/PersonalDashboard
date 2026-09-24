import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../apps/worker/src/auth/token.ts';
import { PAIRING_CODE_PATTERN } from '../apps/worker/src/display/pairing-code.ts';
import { migrate } from '../apps/worker/src/test/d1.ts';
import { planPair } from './pair-sql.ts';

const NOW = new Date('2026-01-15T08:00:00.000Z');

describe('planPair', () => {
  it('stores only the hash of a new code and keeps a single active code', async () => {
    const db = migrate();
    const first = await planPair('hall tablet', NOW);
    const second = await planPair('hall tablet', NOW);
    expect(first.code).toMatch(PAIRING_CODE_PATTERN);

    for (const plan of [first, second]) {
      expect(plan.statements.join()).not.toContain(plan.code);
      db.exec(plan.statements[0]);
      expect(db.prepare(plan.statements[1]).all()).toEqual([{ code_hash: plan.codeHash }]);
    }
    expect(db.prepare('SELECT code_hash, expires_at FROM pairing_codes').all()).toEqual([
      { code_hash: await sha256Hex(second.code), expires_at: '2026-01-15T08:10:00.000Z' },
    ]);
  });

  it('rejects unsafe labels', async () => {
    await expect(planPair("x'); DROP TABLE pairing_codes; --", NOW)).rejects.toThrow();
  });
});
