import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import { airPlan, airTexts } from './air';

function box(w: number, h: number) {
  return { refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) };
}

describe('airPlan', () => {
  it('uses the full layout from the default 2×2 tile up', () => {
    expect(airPlan(box(205, 192))).toEqual({ scale: 1, compact: false });
  });

  it('shows only index and band in a 2×1 tile', () => {
    expect(airPlan(box(205, 92)).compact).toBe(true);
  });
});

describe('airTexts', () => {
  const data = { time: '2026-01-15T14:00', aqi: 18.4, pm2_5: 4.6, pm10: 8.9 };

  it('formats the index, band and particles per locale', () => {
    expect(airTexts(data, 'sk')).toEqual({
      aqi: '18',
      band: 'good',
      label: 'Dobrá',
      particles: 'PM2,5 5 · PM10 9 µg/m³',
      marker: (18.4 / 120) * 100,
    });
    expect(airTexts(data, 'en')).toMatchObject({ label: 'Good', particles: 'PM2.5 5 · PM10 9 µg/m³' });
  });

  it('pins the marker to the end of the scale for very high values', () => {
    expect(airTexts({ ...data, aqi: 250 }, 'en')).toMatchObject({ band: 'extremelyPoor', marker: 100 });
  });

  it('shows dashes and no band without values', () => {
    expect(airTexts({ ...data, aqi: null, pm10: null }, 'en')).toMatchObject({
      aqi: '–',
      band: null,
      label: '',
      marker: null,
      particles: 'PM2.5 5 · PM10 – µg/m³',
    });
  });
});
