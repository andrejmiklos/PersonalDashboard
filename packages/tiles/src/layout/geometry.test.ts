import { describe, expect, it } from 'vitest';
import { sizeClassOf, tileRect } from './geometry';

describe('tileRect', () => {
  it('maps grid cells to stage percentages and reference pixels', () => {
    expect(tileRect({ x: 3, y: 2, w: 6, h: 4 }, 12, 8)).toEqual({
      left: 25,
      top: 25,
      width: 50,
      height: 50,
      refWidth: 640,
      refHeight: 400,
      sizeClass: 'large',
    });
  });
});

describe('sizeClassOf', () => {
  it.each([
    [199, 400, 'compact'],
    [400, 119, 'compact'],
    [320, 200, 'regular'],
    [639, 800, 'regular'],
    [640, 400, 'large'],
  ])('%i×%i is %s', (w, h, expected) => {
    expect(sizeClassOf(w, h)).toBe(expected);
  });
});
