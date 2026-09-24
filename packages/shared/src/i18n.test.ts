import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('t', () => {
  it('returns localised strings', () => {
    expect(t('sk', 'tile.clock')).toBe('Hodiny');
    expect(t('en', 'tile.clock')).toBe('Clock');
  });

  it('interpolates parameters and keeps unknown placeholders', () => {
    expect(t('en', 'state.updatedAt', { time: '08:05' })).toBe('Updated 08:05');
    expect(t('en', 'state.updatedAt')).toBe('Updated {time}');
  });

  it.each([
    [1, '1 deň'],
    [2, '2 dni'],
    [4, '4 dni'],
    [5, '5 dní'],
    [0, '0 dní'],
    [21, '21 dní'],
  ])('uses Slovak plural forms for %i', (n, expected) => {
    expect(t('sk', 'unit.days', { n })).toBe(expected);
  });

  it('uses English plural forms', () => {
    expect(t('en', 'unit.days', { n: 1 })).toBe('1 day');
    expect(t('en', 'unit.days', { n: 3 })).toBe('3 days');
  });
});
