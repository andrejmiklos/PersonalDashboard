// Normalised payload of `GET /api/v1/data/air` (docs/03-tiles.md §7).

export interface AirData {
  /** Local time of the values (`YYYY-MM-DDTHH:mm`). */
  time: string;
  /** European Air Quality Index (0 → 100+); null when the model has no value. */
  aqi: number | null;
  /** µg/m³. */
  pm2_5: number | null;
  pm10: number | null;
}

export const AQI_BANDS = ['good', 'fair', 'moderate', 'poor', 'veryPoor', 'extremelyPoor'] as const;
export type AqiBand = (typeof AQI_BANDS)[number];

/** EEA bands of the European AQI: 0–20 good, 20–40 fair, … above 100 extremely poor. */
export function aqiBand(aqi: number | null): AqiBand | null {
  if (aqi === null) return null;
  const index = Math.min(Math.max(Math.ceil(aqi / 20) - 1, 0), AQI_BANDS.length - 1);
  return AQI_BANDS[index]!;
}
