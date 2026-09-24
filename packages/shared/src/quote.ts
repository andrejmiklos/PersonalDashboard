import type { Locale } from './locale';

/** An entry of `content/quotes.json` (docs/03-tiles.md §4). A null text falls back to the other language. */
export interface QuoteEntry {
  id: string;
  sk: string | null;
  en: string | null;
  author: string;
  /** Slovak form of the author's name, when it differs (e.g. "Konfucius"). */
  authorSk?: string;
}

/** Payload of `GET /api/v1/data/quote`. */
export interface QuoteData {
  id: string;
  /** Local date the quote belongs to. */
  date: string;
  /** Language of `text`; differs from the requested one when only the other translation exists. */
  lang: Locale;
  text: string;
  author: string;
}
