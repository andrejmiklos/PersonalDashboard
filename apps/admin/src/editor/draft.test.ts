import { describe, expect, it } from 'vitest';
import type { LayoutBody } from '../layouts-model';
import { draftKey, parseDraft, restorable, serializeDraft } from './draft';

const body = (name: string): LayoutBody => ({
  schemaVersion: 1,
  name,
  grid: { cols: 12, rows: 8, gap: 8 },
  theme: {},
  tiles: [],
});

describe('draftKey', () => {
  it('is one key per layout', () => {
    expect(draftKey('lay_abcdefghijklmnop')).toBe('admin.draft.lay_abcdefghijklmnop');
  });
});

describe('parseDraft', () => {
  it('reads what serializeDraft wrote', () => {
    const draft = { baseVersion: 3, body: body('Morning') };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
  });

  it.each([
    null,
    '',
    'not json',
    '[]',
    'null',
    '{}',
    '{"baseVersion":"3","body":{}}',
    '{"baseVersion":3,"body":{"name":"x"}}',
    '{"baseVersion":3,"body":{"name":5,"tiles":[],"grid":{},"theme":{}}}',
    '{"baseVersion":1.5,"body":{"name":"x","tiles":[],"grid":{},"theme":{}}}',
  ])('rejects %j', (text) => {
    expect(parseDraft(text)).toBeNull();
  });
});

describe('restorable', () => {
  const server = { version: 3, json: JSON.stringify(body('Morning')) };

  it('returns the draft body when it is based on the current version and differs', () => {
    const draft = { baseVersion: 3, body: body('Morning, edited') };
    expect(restorable(draft, server)).toEqual(draft.body);
  });

  it('has nothing to restore when the draft equals what is saved', () => {
    expect(restorable({ baseVersion: 3, body: body('Morning') }, server)).toBeNull();
  });

  it('drops a draft based on another version', () => {
    expect(restorable({ baseVersion: 2, body: body('Old edit') }, server)).toBeNull();
    expect(restorable({ baseVersion: 4, body: body('Newer') }, server)).toBeNull();
  });

  it('has nothing to restore without a draft', () => {
    expect(restorable(null, server)).toBeNull();
  });
});
