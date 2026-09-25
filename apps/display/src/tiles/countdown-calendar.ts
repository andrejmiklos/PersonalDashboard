import {
  localDateString,
  t,
  TILE_TYPES,
  zonedParts,
  type CalendarData,
  type CountdownConfig,
  type DataEnvelope,
  type Locale,
} from '@dashboard/shared';
import { isStale, startPoller, type DataResult } from '../data';
import { countdownFontSizes, countdownView, valueChars } from './countdown-view';
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

const POLL_MS = 5 * 60_000;
const RETRY_MS = 30_000;
/** Calendar days to look ahead (the endpoint's maximum). */
const DAYS_AHEAD = 365;
/** Shown when `maxEvents` is null and the tile has room; also what is asked for. */
const DEFAULT_EVENTS = 10;
/** Asked for on top of `maxEvents`, for events that are dropped (declined). */
const EXTRA_EVENTS = 4;
/** Smallest text on the tile in px: the wall tablet is read from a distance. */
const MIN_TEXT_PX = 15;
/** Share of the tile height taken by the first event when more follow. */
const MAIN_SHARE = 0.5;

export interface CountdownItem {
  title: string;
  /** Number of days with its unit, "Today!", or a duration with `showTime`. */
  value: string;
  unit: string;
}

function localTarget(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateString(instant, timeZone)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The events the countdown counts down to at `now`, nearest first: events that have not started (all-day
 * events of today still count, they are "Today!"), without declined ones, at most `maxEvents`.
 * The payload is ordered by start, as the endpoint returns it.
 */
export function upcomingItems(
  data: CalendarData,
  config: Pick<CountdownConfig, 'showTime' | 'maxEvents'>,
  now: Date,
  timeZone: string,
  locale: Locale,
): CountdownItem[] {
  const today = localDateString(now, timeZone);
  const items: CountdownItem[] = [];
  for (const event of data.events) {
    if (event.status === 'declined') continue;
    if (event.allDay ? event.start < today : Date.parse(event.start) <= now.getTime()) continue;
    const target = event.allDay ? event.start : localTarget(new Date(event.start), timeZone);
    const view = countdownView(
      now,
      { target, showTime: config.showTime, afterBehaviour: 'hide' },
      timeZone,
      locale,
    );
    if (view.hidden) continue;
    items.push({ title: event.title || t(locale, 'calendar.noTitle'), value: view.value, unit: view.unit });
    if (config.maxEvents !== null && items.length >= config.maxEvents) break;
  }
  return items;
}

function whenText(item: CountdownItem): string {
  return item.unit ? `${item.value} ${item.unit}` : item.value;
}

/** Removes the rows that do not fit below the first event. */
function fitRows(list: HTMLElement): void {
  const limit = list.getBoundingClientRect().bottom + 1;
  const rows = Array.from(list.children) as HTMLElement[];
  const cutAt = rows.findIndex((row) => row.getBoundingClientRect().bottom > limit);
  if (cutAt >= 0) for (let i = rows.length - 1; i >= cutAt; i--) rows[i]!.remove();
}

/**
 * Countdown to the nearest calendar events (docs/03-tiles.md §8, D-21): the first one large, the next ones
 * as a list "title · N days". Events that have started simply drop off.
 */
export function createCalendarCountdown(ctx: TileContext): TileInstance {
  const config = {
    ...TILE_TYPES.countdown.configDefaults,
    source: 'calendar',
    maxEvents: null,
    ...ctx.config,
  } as CountdownConfig;
  ctx.el.classList.add('countdown', 'countdown-cal');

  const message = element('div', 'cd-message', ctx.el);
  const body = element('div', 'cd-body', ctx.el);
  const main = element('div', 'cd-main', body);
  const mainInner = element('div', 'countdown-body', main);
  const line = element('div', 'countdown-line', mainInner);
  const value = element('span', 'countdown-value', line);
  const unit = element('span', 'countdown-unit', line);
  const label = element('div', 'countdown-label', mainInner);
  const list = element('div', 'cd-list', body);
  const updated = element('div', 'cd-updated', body);

  let box: TileBox | null = null;
  let envelope: DataEnvelope<CalendarData> | null = null;
  let shown = '';
  let timer: number | undefined;

  function render(): void {
    if (!box || !envelope) return;
    const now = new Date();
    const items = upcomingItems(envelope.data, config, now, ctx.timezone, ctx.locale);
    if (items.length === 0) {
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

    // Rebuilt only when what is shown changed (new data, a day passing, an event starting).
    const signature = JSON.stringify([items, box.refWidth, box.refHeight, stale]);
    if (signature === shown) return;
    shown = signature;

    const [first, ...rest] = items as [CountdownItem, ...CountdownItem[]];
    setText(value, first.value);
    setText(unit, first.unit);
    unit.hidden = first.unit === '';
    setText(label, first.title);

    // With more events to follow the first one gets half of the tile; alone it may use all of it.
    const share = rest.length > 0 ? MAIN_SHARE : 1;
    main.style.height = rest.length > 0 ? `${share * 100}%` : '100%';
    const sizes = countdownFontSizes(
      { ...box, refHeight: box.refHeight * share },
      valueChars(first),
      first.title.length,
    );
    value.style.fontSize = `${sizes.valuePx / 16}rem`;
    unit.style.fontSize = `${(sizes.valuePx * 0.45) / 16}rem`;
    label.style.fontSize = `${Math.max(sizes.labelPx, MIN_TEXT_PX) / 16}rem`;

    const rowPx = clamp(box.refHeight * 0.075, MIN_TEXT_PX, 22);
    list.style.fontSize = `${rowPx / 16}rem`;
    list.hidden = rest.length === 0;
    list.replaceChildren(
      ...rest.map((item) => {
        const row = document.createElement('div');
        row.className = 'cd-row';
        element('span', 'cd-row-title', row).textContent = item.title;
        element('span', 'cd-row-when', row).textContent = whenText(item);
        return row;
      }),
    );
    fitRows(list);
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

  if (!Array.isArray(config.sourceIds) || config.sourceIds.length === 0) {
    showMessage(message, body, t(ctx.locale, 'calendar.noSources'));
    return { resize: () => {}, destroy: () => ctx.el.replaceChildren() };
  }

  showMessage(message, body, t(ctx.locale, 'state.loading'));
  const query = {
    sources: config.sourceIds.join(','),
    days: String(DAYS_AHEAD),
    limit: String(Math.min(250, (config.maxEvents ?? DEFAULT_EVENTS) + EXTRA_EVENTS)),
  };
  const poller = startPoller({
    load: () => ctx.data.load<CalendarData>('calendar', query),
    peek: () => ctx.data.peek<CalendarData>('calendar', query),
    onResult,
    intervalMs: POLL_MS,
    retryMs: RETRY_MS,
  });
  tick();

  return {
    resize(next) {
      box = next;
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
