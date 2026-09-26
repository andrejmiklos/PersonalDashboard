import type { LayoutDocument } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { cleanName, emptyLayout, exportFileName, formatUpdated, parseImport, toBody } from './layouts-model';

const layout: LayoutDocument = {
  schemaVersion: 1,
  id: 'lay_abcdefghijklmnop',
  name: 'Morning',
  version: 7,
  grid: { cols: 12, rows: 8, gap: 8 },
  theme: { accent: '#4fc3f7' },
  tiles: [{ id: 't1', type: 'clock', x: 0, y: 0, w: 4, h: 2, config: {} }],
};

describe('emptyLayout', () => {
  it('is a valid empty 12×8 layout without id and version', () => {
    const body = emptyLayout('New');
    expect(body).toEqual({
      schemaVersion: 1,
      name: 'New',
      grid: { cols: 12, rows: 8, gap: 8 },
      theme: {},
      tiles: [],
    });
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('version');
  });
});

describe('toBody', () => {
  it('drops the server-owned id and version', () => {
    const body = toBody(layout);
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('version');
    expect(body.tiles).toEqual(layout.tiles);
    expect(body.name).toBe('Morning');
  });
});

describe('parseImport', () => {
  it('reads a layout file and drops id and version', () => {
    const body = parseImport(JSON.stringify(layout));
    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('version');
    expect(body?.name).toBe('Morning');
  });

  it('keeps unknown fields for the server to refuse', () => {
    expect(parseImport('{"name":"x","extra":1}')).toMatchObject({ extra: 1 });
  });

  it.each(['', 'not json', '[]', 'null', '"text"', '42'])('rejects %j', (text) => {
    expect(parseImport(text)).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims and accepts 1–64 characters', () => {
    expect(cleanName('  Morning ')).toBe('Morning');
    expect(cleanName('x'.repeat(64))).toBe('x'.repeat(64));
  });

  it('rejects an empty or too long name', () => {
    expect(cleanName('  ')).toBeNull();
    expect(cleanName('x'.repeat(65))).toBeNull();
  });
});

describe('exportFileName', () => {
  it('makes a plain file name', () => {
    expect(exportFileName('Morning layout')).toBe('morning-layout.json');
    expect(exportFileName('Ráno – Košice!')).toBe('rano-kosice.json');
  });

  it('falls back when nothing usable is left', () => {
    expect(exportFileName('***')).toBe('layout.json');
  });
});

describe('formatUpdated', () => {
  it('formats a date and tolerates a bad one', () => {
    expect(formatUpdated('2026-01-15T12:30:00.000Z', 'en')).toContain('2026');
    expect(formatUpdated('yesterday', 'en')).toBe('');
  });
});
