import { localDateString, MOON_PHASES, type AstroData, type MoonPhaseName } from '@dashboard/shared';
import { getMoonIllumination, getTimes } from 'suncalc';

const DAY_MS = 86_400_000;
/** Bisection steps for the next principal phase: one day / 2^20 is well under a second. */
const BISECT_STEPS = 20;

export function moonPhaseName(phase: number): MoonPhaseName {
  return MOON_PHASES[Math.round(phase * 8) % 8]!;
}

/** About local solar noon of a calendar date, so the date maps to the right solar day at any longitude. */
function solarNoon(date: string, lon: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12) - (lon / 360) * DAY_MS);
}

/** Phase advance from `phase0`, 0–1, unwrapped across the new moon. */
function advance(phase0: number, at: number): number {
  return (getMoonIllumination(new Date(at)).phase - phase0 + 1) % 1;
}

/** First new moon, first quarter, full moon or last quarter after `from`. */
function nextPrincipalPhase(from: Date): { name: MoonPhaseName; at: Date } {
  const phase0 = getMoonIllumination(from).phase;
  const target = (Math.floor(phase0 * 4) + 1) / 4;
  const needed = target - phase0;

  // A quarter of the cycle takes about 7.4 days; step by days, then bisect the last day.
  let before = from.getTime();
  let after = before + DAY_MS;
  while (advance(phase0, after) < needed && after - from.getTime() < 10 * DAY_MS) {
    before = after;
    after += DAY_MS;
  }
  for (let i = 0; i < BISECT_STEPS; i++) {
    const mid = (before + after) / 2;
    if (advance(phase0, mid) < needed) before = mid;
    else after = mid;
  }
  return { name: moonPhaseName(target % 1), at: new Date(after) };
}

/** Sun and moon for a local calendar date at the given (rounded) location. */
export function computeAstro(date: string, lat: number, lon: number, timeZone: string): AstroData {
  const noon = solarNoon(date, lon);
  const times = getTimes(noon, lat, lon);
  const sunrise = times.sunrise;
  const sunset = times.sunset;

  let dayLengthMin: number;
  if (sunrise && sunset) {
    dayLengthMin = Math.round((sunset.getTime() - sunrise.getTime()) / 60_000);
  } else {
    dayLengthMin = times.alwaysUp ? 24 * 60 : 0;
  }

  const moon = getMoonIllumination(noon);
  const next = nextPrincipalPhase(noon);
  return {
    date,
    sunrise: sunrise ? sunrise.toISOString() : null,
    sunset: sunset ? sunset.toISOString() : null,
    dayLengthMin,
    moon: { phase: moon.phase, illumination: moon.fraction, name: moonPhaseName(moon.phase) },
    nextPhase: { name: next.name, date: localDateString(next.at, timeZone) },
  };
}
