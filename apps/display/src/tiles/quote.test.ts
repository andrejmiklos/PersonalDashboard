import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import { fontRange, largestFitting, quoted } from './quote';

function box(w: number, h: number) {
  return { refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) };
}

describe('quoted', () => {
  it('uses Slovak and English quotation marks', () => {
    expect(quoted('Veriť, milovať, pracovať.', 'sk')).toBe('„Veriť, milovať, pracovať.“');
    expect(quoted('Work conquers all.', 'en')).toBe('“Work conquers all.”');
  });
});

describe('fontRange', () => {
  it('grows with the box height up to 3 rem', () => {
    expect(fontRange(box(632, 80)).max).toBeCloseTo(80 / 16 / 2.2);
    expect(fontRange(box(1272, 792)).max).toBe(3);
  });

  it('never goes below a readable minimum', () => {
    expect(fontRange(box(200, 20))).toEqual({ min: 0.75, max: 0.75 });
  });
});

describe('largestFitting', () => {
  it('finds the largest fitting size within the step resolution', () => {
    const size = largestFitting(0.75, 3, 7, (s) => s <= 1.9);
    expect(size).toBeLessThanOrEqual(1.9);
    expect(size).toBeGreaterThan(1.9 - (3 - 0.75) / 2 ** 7);
  });

  it('takes the maximum at once when it fits', () => {
    let calls = 0;
    expect(
      largestFitting(0.75, 3, 7, () => {
        calls++;
        return true;
      }),
    ).toBe(3);
    expect(calls).toBe(1);
  });

  it('falls back to the minimum when nothing fits', () => {
    expect(largestFitting(0.75, 3, 7, () => false)).toBe(0.75);
  });
});
