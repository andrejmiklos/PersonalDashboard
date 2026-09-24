import {
  formatTime,
  formatWeekday,
  t,
  TILE_TYPES,
  WEATHER_HOURS,
  weatherCondition,
  type DataEnvelope,
  type Locale,
  type WeatherConfig,
  type WeatherData,
} from '@dashboard/shared';
import { isStale, startPoller, type DataResult } from '../data';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';
import { createWeatherIcon, weatherIcon } from './weather-icons';

const POLL_MS = 15 * 60_000;
const RETRY_MS = 60_000;

// Block heights in em; the tile's font size is 1rem × scale, so these match style.css.
const EM = 16;
const PAD = 0.75;
const NOW_H = 4.5;
const GAP = 0.75;
const HOURS_H = 4.25;
const HOUR_W = 3.25;
const DAY_H = 1.75;
const FOOT_H = 1.25;

/** What fits into the tile box; decided from the box alone, so it does not change with the data. */
export interface WeatherPlan {
  scale: number;
  compact: boolean;
  hours: number;
  days: number;
  footer: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function weatherPlan(box: TileBox, config: WeatherConfig): WeatherPlan {
  if (box.sizeClass === 'compact') {
    // Icon and temperature side by side, about 7em × 3.5em.
    const scale = clamp(Math.min(box.refWidth / (8 * EM), box.refHeight / (4 * EM)), 0.5, 2);
    return { scale, compact: true, hours: 0, days: 0, footer: false };
  }
  const scale = clamp(Math.min(box.refWidth / 400, box.refHeight / 360), 0.9, 1.75);
  const width = box.refWidth / (EM * scale) - 2 * PAD;
  let free = box.refHeight / (EM * scale) - 2 * PAD - NOW_H - FOOT_H;

  let hours = 0;
  if (config.showHourly && free >= GAP + HOURS_H) {
    hours = Math.min(WEATHER_HOURS, Math.floor(width / HOUR_W));
    free -= GAP + HOURS_H;
  }
  let days = 0;
  if (config.dailyDays > 0 && free >= GAP + DAY_H) {
    days = Math.min(config.dailyDays, Math.floor((free - GAP) / DAY_H));
  }
  return { scale, compact: false, hours, days, footer: true };
}

/** Rounded, with a real minus sign and without "-0". */
export function formatTemperature(value: number | null): string {
  if (value === null) return '–';
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : ''}${Math.abs(rounded)}°`;
}

function formatPercent(value: number | null, locale: Locale): string {
  if (value === null) return '';
  return locale === 'sk' ? `${Math.round(value)} %` : `${Math.round(value)}%`;
}

export interface WeatherTexts {
  temperature: string;
  condition: string;
  details: string;
  hours: { time: string; temperature: string; precipitation: string }[];
  days: { weekday: string; min: string; max: string; precipitation: string }[];
}

export function weatherTexts(data: WeatherData, config: WeatherConfig, locale: Locale): WeatherTexts {
  const today = data.daily[0];
  const details: string[] = [];
  if (config.showFeelsLike && data.current.feelsLike !== null) {
    details.push(t(locale, 'weather.feelsLike', { t: formatTemperature(data.current.feelsLike) }));
  }
  if (today) {
    details.push(`${formatTemperature(today.min)} / ${formatTemperature(today.max)}`);
  }
  if (config.showPrecipitation && today && today.precipitationProbability !== null) {
    details.push(
      t(locale, 'weather.precipitation', { p: formatPercent(today.precipitationProbability, locale) }),
    );
  }
  if (config.showWind && data.current.windSpeed !== null) {
    details.push(t(locale, 'weather.wind', { v: Math.round(data.current.windSpeed) }));
  }

  return {
    temperature: formatTemperature(data.current.temperature),
    condition: t(locale, `weather.${weatherCondition(data.current.code)}`),
    details: details.join(' · '),
    hours: data.hourly.map((hour) => ({
      time: hour.time.slice(11, 16),
      temperature: formatTemperature(hour.temperature),
      precipitation: config.showPrecipitation ? formatPercent(hour.precipitationProbability, locale) : '',
    })),
    // The header already shows today.
    days: data.daily.slice(1).map((day) => ({
      weekday: formatWeekday(day.date, locale),
      min: formatTemperature(day.min),
      max: formatTemperature(day.max),
      precipitation: config.showPrecipitation ? formatPercent(day.precipitationProbability, locale) : '',
    })),
  };
}

/** Weather tile (docs/03-tiles.md §5). */
export function createWeather(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.weather.configDefaults, ...ctx.config } as WeatherConfig;
  ctx.el.classList.add('wx');

  const message = element('div', 'wx-message', ctx.el);
  const body = element('div', 'wx-body', ctx.el);
  const now = element('div', 'wx-now', body);
  const nowIcon = element('div', 'wx-now-icon', now);
  const nowText = element('div', 'wx-now-text', now);
  const temperature = element('div', 'wx-temp', nowText);
  const condition = element('div', 'wx-cond', nowText);
  const details = element('div', 'wx-details', nowText);
  const hours = element('div', 'wx-hours', body);
  const days = element('div', 'wx-days', body);
  const footer = element('div', 'wx-foot', body);
  const updated = element('span', 'wx-updated', footer);
  const attribution = element('span', 'wx-attribution', footer);
  attribution.textContent = t(ctx.locale, 'weather.attribution');

  let plan: WeatherPlan | null = null;
  let envelope: DataEnvelope<WeatherData> | null = null;
  let lastIcon = '';

  function showMessage(text: string): void {
    setText(message, text);
    message.hidden = false;
    body.hidden = true;
  }

  function render(): void {
    if (!plan || !envelope) return;
    const texts = weatherTexts(envelope.data, config, ctx.locale);
    const { current } = envelope.data;
    message.hidden = true;
    body.hidden = false;
    ctx.el.classList.toggle('wx-compact', plan.compact);

    const icon = weatherIcon(current.code, current.isDay);
    if (icon !== lastIcon) {
      nowIcon.replaceChildren(createWeatherIcon(icon));
      lastIcon = icon;
    }
    setText(temperature, texts.temperature);
    setText(condition, texts.condition);
    setText(details, texts.details);
    condition.hidden = plan.compact;
    details.hidden = plan.compact || texts.details === '';

    hours.hidden = plan.hours === 0;
    hours.replaceChildren();
    envelope.data.hourly.slice(0, plan.hours).forEach((hour, i) => {
      const text = texts.hours[i]!;
      const cell = element('div', 'wx-hour', hours);
      element('div', 'wx-hour-time', cell).textContent = text.time;
      cell.appendChild(createWeatherIcon(weatherIcon(hour.code, hour.isDay)));
      element('div', 'wx-hour-temp', cell).textContent = text.temperature;
      element('div', 'wx-precip', cell).textContent = text.precipitation;
    });

    days.hidden = plan.days === 0;
    days.replaceChildren();
    envelope.data.daily.slice(1, 1 + plan.days).forEach((day, i) => {
      const text = texts.days[i]!;
      const row = element('div', 'wx-day', days);
      element('div', 'wx-day-name', row).textContent = text.weekday;
      row.appendChild(createWeatherIcon(weatherIcon(day.code, true)));
      element('div', 'wx-precip', row).textContent = text.precipitation;
      element('div', 'wx-day-min', row).textContent = text.min;
      element('div', 'wx-day-max', row).textContent = text.max;
    });

    const stale = isStale(envelope, Date.now());
    ctx.el.classList.toggle('is-stale', stale);
    footer.hidden = !plan.footer;
    setText(
      updated,
      stale
        ? t(ctx.locale, 'state.updatedAt', {
            time: formatTime(new Date(envelope.updatedAt), {
              locale: ctx.locale,
              timeZone: ctx.timezone,
              hour12: false,
              seconds: false,
            }),
          })
        : '',
    );
  }

  function onResult(result: DataResult<WeatherData>): void {
    if (result.kind === 'ok') {
      envelope = result.envelope;
    } else if (!envelope) {
      showMessage(t(ctx.locale, result.code === 'location_not_set' ? 'weather.noLocation' : 'state.error'));
      ctx.el.classList.add('is-error');
      return;
    }
    // A failed refresh keeps the last payload; render() marks it stale once it is old enough.
    ctx.el.classList.remove('is-error');
    render();
  }

  showMessage(t(ctx.locale, 'state.loading'));
  const poller = startPoller({
    load: () => ctx.data<WeatherData>('weather'),
    onResult,
    intervalMs: POLL_MS,
    retryMs: RETRY_MS,
  });

  return {
    resize(box) {
      plan = weatherPlan(box, config);
      ctx.el.style.fontSize = `${plan.scale}rem`;
      render();
    },
    destroy() {
      poller.stop();
      ctx.el.replaceChildren();
    },
  };
}
