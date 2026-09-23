import { describe, expect, it } from 'vitest';
import { isLocale } from './locale';

describe('isLocale', () => {
  it('accepts supported locales', () => {
    expect(isLocale('sk')).toBe(true);
    expect(isLocale('en')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('SK')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
