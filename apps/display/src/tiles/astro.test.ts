import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import {
  arcPoint,
  astroPlan,
  formatDuration,
  moonLitPath,
  msUntilMidnight,
  sunProgress,
  travelledPath,
} from './astro';

function box(w: number, h: number) {
  return { refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) };
}

describe('astroPlan', () => {
  it('puts sun and moon side by side in the default 3×2 tile', () => {
    expect(astroPlan(box(312, 192))).toEqual({ scale: 0.96, direction: 'row' });
  });

  it('stacks them in a narrow tile', () => {
    expect(astroPlan(box(205, 192)).direction).toBe('column');
  });

  it('keeps text readable in the smallest tile', () => {
    expect(astroPlan(box(205, 92)).scale).toBe(0.8);
  });
});

describe('sunProgress', () => {
  const rise = '2026-09-24T05:00:00.000Z';
  const set = '2026-09-24T17:00:00.000Z';

  it('is the share of daylight that has passed', () => {
    expect(sunProgress(rise, set, Date.parse('2026-09-24T11:00:00.000Z'))).toBe(0.5);
  });

  it('rests on the horizon before sunrise and after sunset', () => {
    expect(sunProgress(rise, set, Date.parse('2026-09-24T03:00:00.000Z'))).toBe(0);
    expect(sunProgress(rise, set, Date.parse('2026-09-24T20:00:00.000Z'))).toBe(1);
  });

  it('is unknown on polar days and nights', () => {
    expect(sunProgress(null, null, 0)).toBeNull();
  });
});

describe('arc geometry', () => {
  it('runs from the left horizon over the top to the right horizon', () => {
    expect(arcPoint(0)).toEqual({ x: 6, y: 44 });
    expect(arcPoint(0.5).x).toBeCloseTo(50);
    expect(arcPoint(0.5).y).toBeCloseTo(6);
    expect(arcPoint(1).x).toBeCloseTo(94);
  });

  it('draws the travelled part up to the sun', () => {
    expect(travelledPath(0.5)).toBe('M6 44A44 38 0 0 1 50 6');
  });
});

describe('moonLitPath', () => {
  it('is the right half at first quarter and the left half at last quarter', () => {
    // A terminator with rx 0 is a straight line, whichever way it sweeps.
    expect(moonLitPath(0.25, 32, 32, 28)).toMatch(/^M32 4A28 28 0 0 1 32 60A0 28 0 0 [01] 32 4Z$/);
    expect(moonLitPath(0.75, 32, 32, 28)).toMatch(/^M32 4A28 28 0 0 0 32 60A0 28 0 0 [01] 32 4Z$/);
  });

  it('is the whole disk at full moon', () => {
    // Left half down, then the right half back up.
    expect(moonLitPath(0.5, 32, 32, 28)).toBe('M32 4A28 28 0 0 0 32 60A28 28 0 0 0 32 4Z');
  });

  it('bulges the terminator towards the lit side for a crescent and away for a gibbous moon', () => {
    // Waxing: lit on the right. Crescent terminator sweeps back on the right (0), gibbous on the left (1).
    expect(moonLitPath(0.1, 32, 32, 28)).toMatch(/A22\.65 28 0 0 0 32 4Z$/);
    expect(moonLitPath(0.4, 32, 32, 28)).toMatch(/A22\.65 28 0 0 1 32 4Z$/);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(725, 'sk')).toBe('12 h 5 min');
    expect(formatDuration(0, 'en')).toBe('0 h 0 min');
  });
});

describe('msUntilMidnight', () => {
  it('counts to the next local midnight plus a minute', () => {
    // 22:30 in Bratislava (UTC+2 in summer).
    const now = new Date('2026-09-24T20:30:00.000Z');
    expect(msUntilMidnight(now, 'Europe/Bratislava')).toBe(91 * 60_000);
  });
});
