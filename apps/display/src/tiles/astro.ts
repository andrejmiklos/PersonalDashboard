import {
  formatDate,
  formatTime,
  t,
  TILE_TYPES,
  type AstroConfig,
  type AstroData,
  type DataEnvelope,
  type Locale,
} from '@dashboard/shared';
import { isStale, msUntilMidnight, startPoller, type DataResult } from '../data';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

const POLL_MS = 6 * 60 * 60_000;
const RETRY_MS = 60_000;
/** The sun moves along the arc between polls. */
const TICK_MS = 5 * 60_000;

const SVG_NS = 'http://www.w3.org/2000/svg';
// Sun arc in a 100×50 box: half an ellipse above the horizon line.
const ARC = { cx: 50, horizon: 44, rx: 44, ry: 38 };

export interface AstroPlan {
  scale: number;
  /** Sun and moon side by side, or stacked in narrow tiles. */
  direction: 'row' | 'column';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function astroPlan(box: TileBox): AstroPlan {
  if (box.refWidth >= 1.3 * box.refHeight) {
    return { scale: clamp(Math.min(box.refWidth / 320, box.refHeight / 200), 0.8, 2), direction: 'row' };
  }
  return { scale: clamp(Math.min(box.refWidth / 200, box.refHeight / 220), 0.8, 2), direction: 'column' };
}

/** Share of the day between sunrise and sunset that has passed, clamped to 0–1; null without both. */
export function sunProgress(sunrise: string | null, sunset: string | null, now: number): number | null {
  if (sunrise === null || sunset === null) return null;
  const start = Date.parse(sunrise);
  const end = Date.parse(sunset);
  return clamp((now - start) / (end - start), 0, 1);
}

/** Point on the arc for a progress of 0 (sunrise, left) … 1 (sunset, right). */
export function arcPoint(progress: number): { x: number; y: number } {
  const angle = Math.PI * progress;
  return { x: ARC.cx - ARC.rx * Math.cos(angle), y: ARC.horizon - ARC.ry * Math.sin(angle) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Path of the part of the arc the sun has travelled. */
export function travelledPath(progress: number): string {
  const end = arcPoint(progress);
  return `M${ARC.cx - ARC.rx} ${ARC.horizon}A${ARC.rx} ${ARC.ry} 0 0 1 ${round2(end.x)} ${round2(end.y)}`;
}

/**
 * Lit part of the moon disk as seen from the northern hemisphere: the lit half-disk plus or
 * minus the half-ellipse of the terminator, whose width follows cos(2π·phase).
 */
export function moonLitPath(phase: number, cx: number, cy: number, r: number): string {
  const cos = Math.cos(2 * Math.PI * phase);
  const rx = round2(r * Math.abs(cos));
  const waxing = phase < 0.5;
  const crescent = cos > 0;
  const outerSweep = waxing ? 1 : 0;
  const terminatorSweep = waxing === crescent ? 0 : 1;
  return (
    `M${cx} ${cy - r}A${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r}` +
    `A${rx} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}Z`
  );
}

export function formatDuration(minutes: number, locale: Locale): string {
  return t(locale, 'astro.duration', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

function svg(tag: string, attrs: Record<string, string>, parent: Element): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const name of Object.keys(attrs)) el.setAttribute(name, attrs[name]!);
  parent.appendChild(el);
  return el;
}

/** Sun & moon tile (docs/03-tiles.md §6). */
export function createAstro(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.astro.configDefaults, ...ctx.config } as AstroConfig;
  ctx.el.classList.add('astro');

  const message = element('div', 'astro-message', ctx.el);
  const body = element('div', 'astro-body', ctx.el);

  const sun = element('div', 'astro-sun', body);
  const arc = svg('svg', { viewBox: '0 0 100 50', class: 'astro-arc', 'aria-hidden': 'true' }, sun);
  svg('path', { d: `M2 ${ARC.horizon}h96`, class: 'astro-horizon' }, arc);
  svg('path', { d: travelledPath(1), class: 'astro-path' }, arc);
  const travelled = svg('path', { d: '', class: 'astro-travelled' }, arc);
  const sunDot = svg('circle', { r: '4', class: 'astro-dot' }, arc);
  const times = element('div', 'astro-times', sun);
  const sunrise = element('span', 'astro-rise', times);
  const sunset = element('span', 'astro-set', times);
  const dayLength = element('div', 'astro-length', sun);

  const moon = element('div', 'astro-moon', body);
  const disk = svg('svg', { viewBox: '0 0 64 64', class: 'astro-disk', 'aria-hidden': 'true' }, moon);
  svg('circle', { cx: '32', cy: '32', r: '28', class: 'astro-disk-dark' }, disk);
  const lit = svg('path', { d: '', class: 'astro-disk-lit' }, disk);
  const moonText = element('div', 'astro-moon-text', moon);
  const moonName = element('div', 'astro-moon-name', moonText);
  const illumination = element('div', 'astro-moon-lit', moonText);
  const next = element('div', 'astro-next', moonText);

  let envelope: DataEnvelope<AstroData> | null = null;
  const time = (iso: string) =>
    formatTime(new Date(iso), { locale: ctx.locale, timeZone: ctx.timezone, hour12: false, seconds: false });

  function showMessage(text: string): void {
    setText(message, text);
    message.hidden = false;
    body.hidden = true;
  }

  function render(): void {
    if (!envelope) return;
    const data = envelope.data;
    message.hidden = true;
    body.hidden = false;
    ctx.el.classList.toggle('is-stale', isStale(envelope, Date.now()));

    const progress = sunProgress(data.sunrise, data.sunset, Date.now());
    sunDot.style.display = progress === null ? 'none' : '';
    if (progress !== null) {
      const point = arcPoint(progress);
      sunDot.setAttribute('cx', String(round2(point.x)));
      sunDot.setAttribute('cy', String(round2(point.y)));
      travelled.setAttribute('d', travelledPath(progress));
      // Before sunrise and after sunset the sun rests on the horizon, dimmed.
      sunDot.classList.toggle('is-down', progress === 0 || progress === 1);
    } else {
      travelled.setAttribute('d', data.dayLengthMin > 0 ? travelledPath(1) : '');
    }

    if (data.sunrise !== null && data.sunset !== null) {
      setText(sunrise, time(data.sunrise));
      setText(sunset, time(data.sunset));
    } else {
      setText(sunrise, t(ctx.locale, data.dayLengthMin > 0 ? 'astro.polarDay' : 'astro.polarNight'));
      setText(sunset, '');
    }
    setText(
      dayLength,
      t(ctx.locale, 'astro.dayLength', { v: formatDuration(data.dayLengthMin, ctx.locale) }),
    );
    dayLength.hidden = !config.showDayLength;

    lit.setAttribute('d', moonLitPath(data.moon.phase, 32, 32, 28));
    setText(moonName, t(ctx.locale, `moon.${data.moon.name}`));
    setText(illumination, `${Math.round(data.moon.illumination * 100)} %`);
    illumination.hidden = !config.showMoonIllumination;
    setText(
      next,
      t(ctx.locale, 'astro.next', {
        phase: t(ctx.locale, `moon.${data.nextPhase.name}`),
        date: formatDate(new Date(`${data.nextPhase.date}T12:00:00Z`), {
          locale: ctx.locale,
          timeZone: 'UTC',
          style: 'short',
        }),
      }),
    );
    next.hidden = !config.showNextPhase;
  }

  function onResult(result: DataResult<AstroData>): void {
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
    load: () => ctx.data<AstroData>('astro'),
    onResult,
    intervalMs: () => Math.min(POLL_MS, msUntilMidnight(new Date(), ctx.timezone)),
    retryMs: RETRY_MS,
  });
  const ticker = window.setInterval(render, TICK_MS);

  return {
    resize(box) {
      const plan = astroPlan(box);
      ctx.el.style.fontSize = `${plan.scale}rem`;
      body.classList.toggle('astro-column', plan.direction === 'column');
    },
    destroy() {
      poller.stop();
      window.clearInterval(ticker);
      ctx.el.replaceChildren();
    },
  };
}
