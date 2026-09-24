// Payload of `GET /api/v1/data/astro` (docs/03-tiles.md §6), computed on the Worker with suncalc.

/** In phase order; each covers one eighth of the cycle around its point (0, 0.125, …). */
export const MOON_PHASES = [
  'new',
  'waxingCrescent',
  'firstQuarter',
  'waxingGibbous',
  'full',
  'waningGibbous',
  'lastQuarter',
  'waningCrescent',
] as const;

export type MoonPhaseName = (typeof MOON_PHASES)[number];

export interface AstroData {
  /** Local calendar date the values are for (`YYYY-MM-DD`). */
  date: string;
  /** ISO instants (UTC); null when the sun does not rise or set that day. */
  sunrise: string | null;
  sunset: string | null;
  /** Minutes between sunrise and sunset; 1440 on a polar day, 0 on a polar night. */
  dayLengthMin: number;
  moon: {
    /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
    phase: number;
    /** Illuminated fraction of the disk, 0–1. */
    illumination: number;
    name: MoonPhaseName;
  };
  /** The next new moon, first quarter, full moon or last quarter, with its local date. */
  nextPhase: { name: MoonPhaseName; date: string };
}
