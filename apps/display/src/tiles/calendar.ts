import {
  t,
  TILE_TYPES,
  type CalendarConfig,
  type CalendarData,
  type CalendarSourceInfo,
  type DataEnvelope,
} from '@dashboard/shared';
import { isStale, startPoller, type DataResult } from '../data';
import { buildAgenda, limitAgenda, type AgendaDay, type AgendaEvent } from './calendar-model';
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

const POLL_MS = 120_000;
const RETRY_MS = 30_000;

/** Font size of the tile in rem; the minimum tile of 3×3 cells gets a little under 1. */
export function calendarScale(box: TileBox): number {
  return clamp(Math.min(box.refWidth / 340, box.refHeight / 300), 0.8, 1.4);
}

/** Bar and dot colours are only taken from the payload if they are plain `#rrggbb`. */
function paint(el: HTMLElement, color: string): void {
  if (color) el.style.background = color;
}

function renderEvent(event: AgendaEvent, parent: HTMLElement): void {
  const state = [
    `cal-${event.progress}`,
    event.declined ? 'cal-declined' : '',
    event.tentative ? 'cal-tentative' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const row = element('div', `cal-row ${state}`, parent);
  paint(element('div', 'cal-bar', row), event.color);
  element('div', 'cal-time', row).textContent = event.time;
  const main = element('div', 'cal-main', row);
  element('div', 'cal-title', main).textContent = event.title;
  if (event.location) element('div', 'cal-loc', main).textContent = event.location;
}

function renderDay(day: AgendaDay, showLocation: boolean, parent: DocumentFragment): void {
  const dayEl = document.createElement('div');
  dayEl.className = 'cal-day';
  element('div', `cal-day-head${day.isToday ? ' cal-today' : ''}`, dayEl).textContent = day.label;
  if (day.allDay.length > 0) {
    const strip = element('div', 'cal-strip', dayEl);
    for (const event of day.allDay) {
      const chip = element('span', `cal-chip${event.declined ? ' cal-declined' : ''}`, strip);
      paint(element('span', 'cal-bar', chip), event.color);
      element('span', 'cal-chip-text', chip).textContent = event.note
        ? `${event.title} · ${event.note}`
        : event.title;
    }
  }
  for (const event of day.timed) {
    renderEvent(showLocation ? event : { ...event, location: '' }, dayEl);
  }
  parent.appendChild(dayEl);
}

/** Removes what does not fit below the tile's height, then any day left without content. */
function fitToHeight(list: HTMLElement): void {
  const limit = list.getBoundingClientRect().bottom + 1;
  const items = Array.from(list.querySelectorAll<HTMLElement>('.cal-day-head, .cal-strip, .cal-row'));
  const cutAt = items.findIndex((item) => item.getBoundingClientRect().bottom > limit);
  if (cutAt < 0) return;
  for (let i = items.length - 1; i >= cutAt; i--) items[i]!.remove();
  let last = list.lastElementChild;
  while (
    last &&
    (last.childElementCount === 0 ||
      (last.childElementCount === 1 && last.firstElementChild!.classList.contains('cal-day-head')))
  ) {
    last.remove();
    last = list.lastElementChild;
  }
}

function renderLegend(legend: HTMLElement, sources: CalendarSourceInfo[]): void {
  const items = sources.map((source) => {
    const item = document.createElement('span');
    item.className = 'cal-legend-item';
    paint(element('span', 'cal-dot', item), source.color ?? '');
    element('span', 'cal-legend-text', item).textContent = source.label;
    return item;
  });
  legend.replaceChildren(...items);
}

/** Calendar tile (docs/03-tiles.md §2): agenda with a colour per calendar and an all-day strip per day. */
export function createCalendar(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.calendar.configDefaults, ...ctx.config } as CalendarConfig;
  ctx.el.classList.add('cal');

  const message = element('div', 'cal-message', ctx.el);
  const body = element('div', 'cal-body', ctx.el);
  const list = element('div', 'cal-list', body);
  const legend = element('div', 'cal-legend', body);
  const updated = element('div', 'cal-updated', body);

  let scale: number | null = null;
  let envelope: DataEnvelope<CalendarData> | null = null;
  let shown = '';
  let timer: number | undefined;

  function render(): void {
    if (scale === null || !envelope) return;
    const now = new Date();
    const days = limitAgenda(
      buildAgenda(envelope.data, config, now, ctx.timezone, ctx.locale),
      config.maxEvents,
    );
    if (days.length === 0) {
      showMessage(message, body, t(ctx.locale, 'calendar.empty'));
      shown = '';
      return;
    }
    message.hidden = true;
    body.hidden = false;

    const stale = isStale(envelope, now.getTime());
    ctx.el.classList.toggle('is-stale', stale);
    setText(updated, updatedText(ctx, envelope, stale));
    updated.hidden = !stale;
    legend.hidden = !config.showLegend;

    // Rebuilt only when what is shown changed (data, a new minute moving events to "now" or "past").
    const signature = JSON.stringify([
      days,
      envelope.data.sources,
      config.showLegend,
      config.showLocation,
      scale,
    ]);
    if (signature === shown) return;
    shown = signature;
    const fragment = document.createDocumentFragment();
    for (const day of days) renderDay(day, config.showLocation, fragment);
    list.replaceChildren(fragment);
    if (config.showLegend) renderLegend(legend, envelope.data.sources);
    fitToHeight(list);
  }

  function onResult(result: DataResult<CalendarData>): void {
    if (result.kind === 'ok') {
      envelope = result.envelope;
    } else if (!envelope) {
      showMessage(message, body, errorText(ctx.locale, result.code));
      return;
    }
    render();
  }

  function tick(): void {
    render();
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
  }

  if (config.sourceIds.length === 0) {
    showMessage(message, body, t(ctx.locale, 'calendar.noSources'));
    return { resize: () => {}, destroy: () => ctx.el.replaceChildren() };
  }

  showMessage(message, body, t(ctx.locale, 'state.loading'));
  const query = { sources: config.sourceIds.join(','), days: String(config.daysAhead) };
  const poller = startPoller({
    load: () => ctx.data.load<CalendarData>('calendar', query),
    peek: () => ctx.data.peek<CalendarData>('calendar', query),
    onResult,
    intervalMs: POLL_MS,
    retryMs: RETRY_MS,
  });
  tick();

  return {
    resize(box) {
      scale = calendarScale(box);
      ctx.el.style.fontSize = `${scale}rem`;
      shown = '';
      render();
    },
    destroy() {
      poller.stop();
      window.clearTimeout(timer);
      ctx.el.replaceChildren();
    },
  };
}
