import { describe, expect, it } from 'vitest';
import { isOffline, OFFLINE_AFTER_MS } from './offline';

describe('isOffline', () => {
  const lastOk = Date.parse('2026-01-15T13:00:00.000Z');

  it('waits five minutes of failing polls before showing the badge', () => {
    expect(isOffline(lastOk, true, lastOk + OFFLINE_AFTER_MS - 1)).toBe(false);
    expect(isOffline(lastOk, true, lastOk + OFFLINE_AFTER_MS)).toBe(true);
  });

  it('never shows it while polls succeed', () => {
    expect(isOffline(lastOk, false, lastOk + 60 * 60_000)).toBe(false);
  });
});
