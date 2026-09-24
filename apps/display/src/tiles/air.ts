import {
  aqiBand,
  AQI_BANDS,
  formatTime,
  t,
  TILE_TYPES,
  type AirConfig,
  type AirData,
  type AqiBand,
  type DataEnvelope,
  type Locale,
} from '@dashboard/shared';
import { isStale, startPoller, type DataResult } from '../data';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

const POLL_MS = 60 * 60_000;
const RETRY_MS = 60_000;
/** The scale shows six bands of 20; values above 120 sit at its end. */
const SCALE_MAX = 120;

export interface AirPlan {
  scale: number;
  compact: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function airPlan(box: TileBox): AirPlan {
  if (box.sizeClass === 'compact') {
    return { scale: clamp(Math.min(box.refWidth / 180, box.refHeight / 80), 0.6, 1.6), compact: true };
  }
  return { scale: clamp(Math.min(box.refWidth / 205, box.refHeight / 190), 0.8, 2), compact: false };
}

export interface AirTexts {
  aqi: string;
  band: AqiBand | null;
  label: string;
  particles: string;
  /** Position of the marker on the scale, 0–100 %, or null without an index. */
  marker: number | null;
}

function round(value: number | null): string {
  return value === null ? '–' : String(Math.round(value));
}

export function airTexts(data: AirData, locale: Locale): AirTexts {
  const band = aqiBand(data.aqi);
  return {
    aqi: round(data.aqi),
    band,
    label: band === null ? '' : t(locale, `air.${band}`),
    particles: t(locale, 'air.particles', { a: round(data.pm2_5), b: round(data.pm10) }),
    marker: data.aqi === null ? null : (clamp(data.aqi, 0, SCALE_MAX) / SCALE_MAX) * 100,
  };
}

/** Air quality tile (docs/03-tiles.md §7). */
export function createAir(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.air.configDefaults, ...ctx.config } as AirConfig;
  ctx.el.classList.add('air');

  const message = element('div', 'air-message', ctx.el);
  const body = element('div', 'air-body', ctx.el);
  const head = element('div', 'air-head', body);
  const value = element('div', 'air-value', head);
  const label = element('div', 'air-label', head);
  const scale = element('div', 'air-scale', body);
  for (const band of AQI_BANDS) element('div', `air-segment air-bg-${band}`, scale);
  const marker = element('div', 'air-marker', scale);
  const index = element('div', 'air-index', body);
  index.textContent = t(ctx.locale, 'air.index');
  const particles = element('div', 'air-particles', body);
  const footer = element('div', 'air-foot', body);
  const updated = element('span', 'air-updated', footer);
  const attribution = element('span', 'air-attribution', footer);
  attribution.textContent = t(ctx.locale, 'air.attribution');

  let plan: AirPlan | null = null;
  let envelope: DataEnvelope<AirData> | null = null;

  function showMessage(text: string): void {
    setText(message, text);
    message.hidden = false;
    body.hidden = true;
  }

  function render(): void {
    if (!plan || !envelope) return;
    const texts = airTexts(envelope.data, ctx.locale);
    message.hidden = true;
    body.hidden = false;
    ctx.el.classList.toggle('air-compact', plan.compact);

    setText(value, texts.aqi);
    setText(label, texts.label);
    label.className = `air-label${texts.band ? ` air-fg-${texts.band}` : ''}`;
    scale.hidden = plan.compact || texts.marker === null;
    if (texts.marker !== null) marker.style.left = `${texts.marker}%`;
    index.hidden = plan.compact;
    setText(particles, texts.particles);
    particles.hidden = plan.compact || !config.showParticles;

    const stale = isStale(envelope, Date.now());
    ctx.el.classList.toggle('is-stale', stale);
    footer.hidden = plan.compact;
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

  function onResult(result: DataResult<AirData>): void {
    if (result.kind === 'ok') {
      envelope = result.envelope;
    } else if (!envelope) {
      showMessage(t(ctx.locale, result.code === 'location_not_set' ? 'data.noLocation' : 'state.error'));
      return;
    }
    render();
  }

  showMessage(t(ctx.locale, 'state.loading'));
  const poller = startPoller({
    load: () => ctx.data<AirData>('air'),
    onResult,
    intervalMs: POLL_MS,
    retryMs: RETRY_MS,
  });

  return {
    resize(box) {
      plan = airPlan(box);
      ctx.el.style.fontSize = `${plan.scale}rem`;
      render();
    },
    destroy() {
      poller.stop();
      ctx.el.replaceChildren();
    },
  };
}
