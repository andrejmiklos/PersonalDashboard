import { describe, expect, it } from 'vitest';
import { generateId, ID_PATTERN } from '../ids';
import { generateToken, hashToken, parseTokenRole, timingSafeEqual } from './token';

describe('generateToken', () => {
  it('produces tokens the parser accepts, with the right role', () => {
    expect(parseTokenRole(generateToken('admin'))).toBe('admin');
    expect(parseTokenRole(generateToken('device'))).toBe('device');
  });

  it('produces distinct tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken('device')));
    expect(tokens.size).toBe(100);
  });
});

describe('parseTokenRole', () => {
  it.each([
    '',
    'dsh_root_' + 'A'.repeat(43),
    'dsh_admin_' + 'A'.repeat(42),
    'dsh_admin_' + 'A'.repeat(44),
    'dsh_admin_' + 'A'.repeat(42) + '=',
    ' dsh_admin_' + 'A'.repeat(43),
  ])('rejects %j', (token) => {
    expect(parseTokenRole(token)).toBeNull();
  });
});

describe('hashToken', () => {
  it('returns lowercase hex SHA-256', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('timingSafeEqual', () => {
  it('compares strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('generateId', () => {
  it('produces prefixed base32 ids', () => {
    const id = generateId('tok');
    expect(id).toMatch(/^tok_/);
    expect(id).toMatch(ID_PATTERN);
  });
});
