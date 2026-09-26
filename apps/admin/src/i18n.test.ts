import { describe, expect, it } from 'vitest';
import { initialLocale } from './i18n';

describe('initialLocale', () => {
  it('prefers the stored choice', () => {
    expect(initialLocale('en', 'sk-SK')).toBe('en');
    expect(initialLocale('sk', 'en-US')).toBe('sk');
  });

  it('ignores a stored value that is not a locale', () => {
    expect(initialLocale('de', 'sk-SK')).toBe('sk');
  });

  it('uses Slovak for a Slovak browser and English otherwise', () => {
    expect(initialLocale(null, 'sk-SK')).toBe('sk');
    expect(initialLocale(null, 'en-GB')).toBe('en');
    expect(initialLocale(null, 'de-DE')).toBe('en');
  });
});
