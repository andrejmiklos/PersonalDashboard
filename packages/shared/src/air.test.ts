import { describe, expect, it } from 'vitest';
import { aqiBand, AQI_BANDS } from './air';
import { t, type MessageKey } from './i18n';

describe('aqiBand', () => {
  it.each([
    [0, 'good'],
    [20, 'good'],
    [20.1, 'fair'],
    [40, 'fair'],
    [55, 'moderate'],
    [80, 'poor'],
    [100, 'veryPoor'],
    [100.5, 'extremelyPoor'],
    [400, 'extremelyPoor'],
  ] as const)('puts %s into %s', (aqi, band) => {
    expect(aqiBand(aqi)).toBe(band);
  });

  it('has no band without a value', () => {
    expect(aqiBand(null)).toBeNull();
  });

  it('has a label for every band in both languages', () => {
    for (const band of AQI_BANDS) {
      const key = `air.${band}` as MessageKey;
      expect(t('sk', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
  });
});
