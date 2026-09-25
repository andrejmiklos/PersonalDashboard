import {
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
import {
  clamp,
  element,
  errorText,
  setText,
  showMessage,
  type TileBox,
  type TileContext,
  type TileInstance,
  updatedText,
} from './types';
import { createWeatherIcon, weatherIcon } from './weather-icons';

const POLL_MS = 15 * 60_000;
const RETRY_MS = 60_000;

// Block heights in em; the tile's font size is 1rem × scale, so these match style.css.
const EM = 16;
const PAD = 0.75;
/** Icon and temperature (with the place name beside them). */
const TOP_H = 5.25;
const LINE_H = 1.5;
const GAP = 0.75;
/** Hour, icon, temperature and precipitation of the hourly strip; a wind row adds WIND_H. */
const HOURS_H = 5.5;
const WIND_H = 1.1;
const HOUR_W = 3.5;
const DAY_H = 2.1;
const FOOT_H = 1.25;

/** What fits into the tile box; decided from the box alone, so it does not change with the data. */
export interface WeatherPlan {
  scale: number;
  compact: boolean;
  hours: number;
  /** A wind row under the hourly strip. */
  hourWind: boolean;
  days: number;
  footer: boolean;
}

/**
 * Cut order when the tile is short: the daily rows first, then the wind row of the hourly strip, then the
 * strip itself. Daily rows never take the place of an hourly strip that did not fit.
 */
export function weatherPlan(box: TileBox, config: WeatherConfig): WeatherPlan {
  if (box.sizeClass === 'compact') {
    // Icon and temperature side by side, about 9em × 5em.
    const scale = clamp(Math.min(box.refWidth / (10 * EM), box.refHeight / (5.5 * EM)), 0.5, 2);
    return { scale, compact: true, hours: 0, hourWind: false, days: 0, footer: false };
  }
  const scale = clamp(Math.min(box.refWidth / 400, box.refHeight / 360), 0.9, 1.75);
  const width = box.refWidth / (EM * scale) - 2 * PAD;
  const lines = 1 + (config.showPrecipitation || config.showWind ? 1 : 0);
  let free = box.refHeight / (EM * scale) - 2 * PAD - TOP_H - FOOT_H - lines * LINE_H;

  let hours = 0;
  let hourWind = false;
  if (config.showHourly) {
    const strip = GAP + HOURS_H;
    if (config.showWind && free >= strip + WIND_H) {
      hourWind = true;
    }
    if (hourWind || free >= strip) {
      hours = Math.min(WEATHER_HOURS, Math.floor(width / HOUR_W));
      free -= strip + (hourWind ? WIND_H : 0);
    }
  }
  let days = 0;
  if (config.dailyDays > 0 && !(config.showHourly && hours === 0) && free >= GAP + DAY_H) {
    days = Math.min(config.dailyDays, Math.floor((free - GAP) / DAY_H));
  }
  return { scale, compact: false, hours, hourWind, days, footer: true };
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
  /** Condition, feels-like temperature and today's minimum / maximum. */
  line1: string;
  /** Precipitation and wind; empty when both are switched off, then the line is left out. */
  line2: string;
  hours: { time: string; temperature: string; precipitation: string; wind: string }[];
  days: { weekday: string; min: string; max: string; precipitation: string }[];
}

export function weatherTexts(data: WeatherData, config: WeatherConfig, locale: Locale): WeatherTexts {
  const today = data.daily[0];
  const line1 = [t(locale, `weather.${weatherCondition(data.current.code)}`)];
  if (config.showFeelsLike && data.current.feelsLike !== null) {
    line1.push(t(locale, 'weather.feelsLike', { t: formatTemperature(data.current.feelsLike) }));
  }
  if (today) {
    line1.push(`${formatTemperature(today.min)} / ${formatTemperature(today.max)}`);
  }
  const line2: string[] = [];
  if (config.showPrecipitation && today && today.precipitationProbability !== null) {
    line2.push(
      t(locale, 'weather.precipitation', { p: formatPercent(today.precipitationProbability, locale) }),
    );
  }
  if (config.showWind && data.current.windSpeed !== null) {
    line2.push(t(locale, 'weather.wind', { v: Math.round(data.current.windSpeed) }));
  }

  return {
    temperature: formatTemperature(data.current.temperature),
    line1: line1.join(' · '),
    line2: line2.join(' · '),
    hours: data.hourly.map((hour) => ({
      time: hour.time.slice(11, 16),
      temperature: formatTemperature(hour.temperature),
      precipitation: config.showPrecipitation ? formatPercent(hour.precipitationProbability, locale) : '',
      // km/h without the unit: the second line already names it.
      wind: config.showWind && hour.windSpeed != null ? String(Math.round(hour.windSpeed)) : '',
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
  const top = element('div', 'wx-top', body);
  const now = element('div', 'wx-now', top);
  const nowIcon = element('div', 'wx-now-icon', now);
  const temperature = element('div', 'wx-temp', now);
  const place = element('div', 'wx-place', top);
  const line1 = element('div', 'wx-line1', body);
  const line2 = element('div', 'wx-line2', body);
  const hours = element('div', 'wx-hours', body);
  const days = element('div', 'wx-days', body);
  const footer = element('div', 'wx-foot', body);
  const updated = element('span', 'wx-updated', footer);
  const attribution = element('span', 'wx-attribution', footer);
  attribution.textContent = t(ctx.locale, 'weather.attribution');

  let plan: WeatherPlan | null = null;
  let envelope: DataEnvelope<WeatherData> | null = null;
  let lastIcon = '';

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
    const name = config.showLocation && !plan.compact ? (envelope.data.place ?? '') : '';
    setText(place, name);
    place.hidden = name === '';
    setText(temperature, texts.temperature);
    setText(line1, texts.line1);
    setText(line2, texts.line2);
    line1.hidden = plan.compact;
    line2.hidden = plan.compact || texts.line2 === '';

    const hourWind = plan.hourWind;
    hours.hidden = plan.hours === 0;
    hours.replaceChildren();
    envelope.data.hourly.slice(0, plan.hours).forEach((hour, i) => {
      const text = texts.hours[i]!;
      const cell = element('div', 'wx-hour', hours);
      element('div', 'wx-hour-time', cell).textContent = text.time;
      cell.appendChild(createWeatherIcon(weatherIcon(hour.code, hour.isDay)));
      element('div', 'wx-hour-temp', cell).textContent = text.temperature;
      element('div', 'wx-precip', cell).textContent = text.precipitation;
      if (hourWind) element('div', 'wx-wind', cell).textContent = text.wind;
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
    setText(updated, updatedText(ctx, envelope, stale));
  }

  function onResult(result: DataResult<WeatherData>): void {
    if (result.kind === 'ok') {
      envelope = result.envelope;
    } else if (!envelope) {
      showMessage(message, body, errorText(ctx.locale, result.code));
      ctx.el.classList.add('is-error');
      return;
    }
    // A failed refresh keeps the last payload; render() marks it stale once it is old enough.
    ctx.el.classList.remove('is-error');
    render();
  }

  showMessage(message, body, t(ctx.locale, 'state.loading'));
  const poller = startPoller({
    load: () => ctx.data.load<WeatherData>('weather'),
    peek: () => ctx.data.peek<WeatherData>('weather'),
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
