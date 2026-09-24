import {
  t,
  TILE_TYPES,
  type DataEnvelope,
  type Locale,
  type QuoteConfig,
  type QuoteData,
} from '@dashboard/shared';
import { isStale, msUntilMidnight, startPoller, type DataResult } from '../data';
import { element, setText, type TileBox, type TileContext, type TileInstance } from './types';

const RETRY_MS = 60_000;
/** Each step halves the range: 7 steps find the size within 1 % of the range. */
const FIT_STEPS = 7;
const MIN_REM = 0.75;

export function quoted(text: string, lang: Locale): string {
  return lang === 'sk' ? `„${text}“` : `“${text}”`;
}

/** Font size range in rem for a box: from readable up to what one short line could use. */
export function fontRange(box: TileBox): { min: number; max: number } {
  return { min: MIN_REM, max: Math.max(MIN_REM, Math.min(box.refHeight / 16 / 2.2, 3)) };
}

/** Largest size in [min, max] for which `fits` holds (fits must be monotonic); `min` if none does. */
export function largestFitting(
  min: number,
  max: number,
  steps: number,
  fits: (size: number) => boolean,
): number {
  if (fits(max)) return max;
  let lo = min;
  let hi = max;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Quote of the day tile (docs/03-tiles.md §4). */
export function createQuote(ctx: TileContext): TileInstance {
  const config = { ...TILE_TYPES.quote.configDefaults, ...ctx.config } as QuoteConfig;
  const lang: Locale = config.language === 'auto' ? ctx.locale : config.language;
  ctx.el.classList.add('quote');

  const message = element('div', 'quote-message', ctx.el);
  const body = element('figure', 'quote-body', ctx.el);
  const text = element('blockquote', 'quote-text', body);
  const author = element('figcaption', 'quote-author', body);

  let box: TileBox | null = null;
  let envelope: DataEnvelope<QuoteData> | null = null;

  function showMessage(value: string): void {
    setText(message, value);
    message.hidden = false;
    body.hidden = true;
  }

  /** Measures in the live DOM; runs only when the text or the box changes. */
  function fit(): void {
    if (!box || body.hidden) return;
    const range = fontRange(box);
    const style = getComputedStyle(ctx.el);
    const height = ctx.el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const width = ctx.el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const size = largestFitting(range.min, range.max, FIT_STEPS, (rem) => {
      body.style.fontSize = `${rem}rem`;
      return body.offsetHeight <= height && body.scrollWidth <= width;
    });
    body.style.fontSize = `${size}rem`;
  }

  function render(): void {
    if (!envelope) return;
    const data = envelope.data;
    message.hidden = true;
    body.hidden = false;
    ctx.el.classList.toggle('is-stale', isStale(envelope, Date.now()));
    body.setAttribute('lang', data.lang);
    setText(text, quoted(data.text, data.lang));
    setText(author, `— ${data.author}`);
    author.hidden = !config.showAuthor;
    fit();
  }

  function onResult(result: DataResult<QuoteData>): void {
    if (result.kind === 'ok') {
      const changed = envelope?.data.id !== result.envelope.data.id;
      envelope = result.envelope;
      if (changed) render();
      else ctx.el.classList.toggle('is-stale', isStale(envelope, Date.now()));
    } else if (!envelope) {
      showMessage(t(ctx.locale, 'state.error'));
    }
  }

  showMessage(t(ctx.locale, 'state.loading'));
  const poller = startPoller({
    load: () => ctx.data<QuoteData>('quote', { lang }),
    onResult,
    intervalMs: () => msUntilMidnight(new Date(), ctx.timezone),
    retryMs: RETRY_MS,
  });

  return {
    resize(next) {
      box = next;
      fit();
    },
    destroy() {
      poller.stop();
      ctx.el.replaceChildren();
    },
  };
}
