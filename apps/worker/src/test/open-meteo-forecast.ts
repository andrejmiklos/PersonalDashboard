import type { OpenMeteoForecast } from '../providers/open-meteo/weather';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Fictional Open-Meteo forecast: 6 days of hourly data from 2026-01-15, "now" at 14:15.
 * Hourly temperature = hour of day / 2, so values are easy to check.
 */
export function forecastFixture(): OpenMeteoForecast {
  const days = Array.from({ length: 6 }, (_, d) => `2026-01-${pad(15 + d)}`);
  const hours = days.flatMap((day) => Array.from({ length: 24 }, (_, h) => `${day}T${pad(h)}:00`));
  const hourOf = (time: string) => Number(time.slice(11, 13));
  return {
    current: {
      time: '2026-01-15T14:15',
      temperature_2m: 3.4,
      apparent_temperature: 0.9,
      weather_code: 3,
      is_day: 1,
      wind_speed_10m: 12.5,
      precipitation: 0,
    },
    hourly: {
      time: hours,
      temperature_2m: hours.map((t) => hourOf(t) / 2),
      precipitation_probability: hours.map(() => 10),
      weather_code: hours.map(() => 61),
      is_day: hours.map((t) => (hourOf(t) >= 8 && hourOf(t) < 16 ? 1 : 0)),
    },
    daily: {
      time: days,
      weather_code: days.map(() => 71),
      temperature_2m_max: days.map((_, i) => 4 + i),
      temperature_2m_min: days.map((_, i) => -2 - i),
      precipitation_probability_max: days.map(() => 40),
    },
  };
}
