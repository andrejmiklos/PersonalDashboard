import type { QuoteEntry } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { permutation, QUOTES, quoteForDate, quoteOfDay } from './select';

const MAX_LENGTH = 180;

describe('content/quotes.json', () => {
  it('has at least 60 quotes with unique ids', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(60);
    const ids = QUOTES.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^q\d{3}$/);
  });

  it('has short texts, at least one language and an author for every quote', () => {
    for (const quote of QUOTES) {
      const where = `quote ${quote.id}`;
      expect(quote.sk !== null || quote.en !== null, where).toBe(true);
      for (const text of [quote.sk, quote.en]) {
        if (text === null) continue;
        expect(text.trim(), where).toBe(text);
        expect(text.length, where).toBeGreaterThan(0);
        expect(text.length, where).toBeLessThanOrEqual(MAX_LENGTH);
      }
      expect(quote.author.trim().length, where).toBeGreaterThan(0);
      expect(
        Object.keys(quote).every((k) => ['id', 'sk', 'en', 'author', 'authorSk'].includes(k)),
        where,
      ).toBe(true);
    }
  });
});

describe('permutation', () => {
  it('is a stable shuffle of all indexes', () => {
    const order = permutation(70, 42);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 70 }, (_, i) => i));
    expect(permutation(70, 42)).toEqual(order);
    expect(order).not.toEqual(Array.from({ length: 70 }, (_, i) => i));
  });
});

describe('quoteOfDay', () => {
  it('stays the same for a date and changes on the next day', () => {
    expect(quoteOfDay('2026-09-24', 'sk')).toEqual(quoteOfDay('2026-09-24', 'sk'));
    expect(quoteOfDay('2026-09-25', 'sk').id).not.toBe(quoteOfDay('2026-09-24', 'sk').id);
  });

  it('shows every quote once before repeating', () => {
    const start = Date.UTC(2026, 0, 1);
    const ids = QUOTES.map(
      (_, i) => quoteOfDay(new Date(start + i * 86_400_000).toISOString().slice(0, 10), 'en').id,
    );
    expect(new Set(ids).size).toBe(QUOTES.length);
  });

  it('returns the same quote in both languages', () => {
    const sk = quoteOfDay('2026-09-24', 'sk');
    const en = quoteOfDay('2026-09-24', 'en');
    expect(sk.id).toBe(en.id);
    expect(sk.lang).toBe('sk');
    expect(en.lang).toBe('en');
  });
});

describe('quoteForDate', () => {
  // Fictional entries.
  const entries: QuoteEntry[] = [
    { id: 'q001', sk: null, en: 'Only English.', author: 'Confucius', authorSk: 'Konfucius' },
  ];

  it('falls back to the other language but keeps the author name in the requested one', () => {
    expect(quoteForDate(entries, [0], '2026-09-24', 'sk')).toEqual({
      id: 'q001',
      date: '2026-09-24',
      lang: 'en',
      text: 'Only English.',
      author: 'Konfucius',
    });
  });

  it('uses the English author name for English', () => {
    expect(quoteForDate(entries, [0], '2026-09-24', 'en').author).toBe('Confucius');
  });
});
