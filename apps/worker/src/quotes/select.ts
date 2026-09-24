import { dayNumber, type Locale, type QuoteData, type QuoteEntry } from '@dashboard/shared';
import content from '../../../../content/quotes.json';

/** Changing the seed reshuffles the order; adding quotes does too, which is fine. */
const SEED = 0x5eed_2026;

/** Small deterministic PRNG (mulberry32): the same seed gives the same order on every deploy. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of 0 … n-1. */
export function permutation(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const next = random(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * Quote of a local date: consecutive days walk through a fixed shuffled order, so no quote repeats
 * until all have been shown.
 */
export function quoteForDate(
  entries: readonly QuoteEntry[],
  order: readonly number[],
  date: string,
  lang: Locale,
): QuoteData {
  const day = dayNumber(date);
  const entry = entries[order[((day % entries.length) + entries.length) % entries.length]!]!;
  const preferred = lang === 'sk' ? entry.sk : entry.en;
  const text = preferred ?? (lang === 'sk' ? entry.en : entry.sk) ?? '';
  const actual: Locale = preferred !== null ? lang : lang === 'sk' ? 'en' : 'sk';
  return {
    id: entry.id,
    date,
    lang: actual,
    text,
    // The name follows the UI language even when the text falls back.
    author: lang === 'sk' ? (entry.authorSk ?? entry.author) : entry.author,
  };
}

/** The bundled list (content/quotes.json); checked by quotes.test.ts. */
export const QUOTES = content as QuoteEntry[];
const ORDER = permutation(QUOTES.length, SEED);

export function quoteOfDay(date: string, lang: Locale): QuoteData {
  return quoteForDate(QUOTES, ORDER, date, lang);
}
