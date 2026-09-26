import { configDefaultsFor, fieldsFor, TILE_TYPES, type FieldDef, type TileType } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { configSchemaFor } from './schema';

// The editor generates its forms from the field descriptors of the registry (packages/shared/src/tiles.ts).
// They must describe exactly what the Worker accepts on save.

const SOURCE = 'src_aaaaaaaaaaaaaaaa';

/** A valid config of each kind of tile: the keys that have no default plus what the variant needs. */
const VARIANTS: { name: string; type: TileType; base: Record<string, unknown> }[] = [
  { name: 'clock', type: 'clock', base: {} },
  { name: 'calendar', type: 'calendar', base: { sourceIds: [SOURCE] } },
  { name: 'tasks', type: 'tasks', base: { sourceIds: [SOURCE] } },
  { name: 'quote', type: 'quote', base: {} },
  { name: 'weather', type: 'weather', base: {} },
  { name: 'astro', type: 'astro', base: {} },
  { name: 'air', type: 'air', base: {} },
  { name: 'countdown (one event)', type: 'countdown', base: { label: 'Holiday', target: '2026-12-24' } },
  { name: 'countdown (calendar)', type: 'countdown', base: { source: 'calendar', sourceIds: [SOURCE] } },
];

function accepts(type: TileType, config: Record<string, unknown>): boolean {
  return configSchemaFor(type, config).safeParse(config).success;
}

function samples(field: FieldDef): { valid: unknown[]; invalid: unknown[] } {
  switch (field.kind) {
    case 'boolean':
      return { valid: [true, false], invalid: ['yes', 1, null] };
    case 'enum':
      return { valid: [...field.options], invalid: ['bogus', 1, null] };
    case 'integer':
      return {
        valid: [field.min, field.max, ...(field.nullable ? [null] : [])],
        invalid: [field.min - 1, field.max + 1, field.min + 0.5, '5', ...(field.nullable ? [] : [null])],
      };
    case 'text':
      return { valid: ['x', 'x'.repeat(field.maxLength)], invalid: ['', 'x'.repeat(field.maxLength + 1), 5] };
    case 'datetime':
      return {
        valid: ['2026-12-24', '2026-12-24T18:30'],
        invalid: ['tomorrow', '2026-02-30', '2026-12-24T25:00'],
      };
    case 'sources':
      return { valid: [[SOURCE]], invalid: [[], ['bad'], [SOURCE, SOURCE], 'src'] };
  }
}

describe.each(VARIANTS)('$name', ({ type, base }) => {
  const fields = fieldsFor(type, base);

  it('lists every key the schema knows, and only those', () => {
    const shape = (configSchemaFor(type, base) as unknown as z.ZodObject).shape;
    expect(fields.map((f) => f.key).sort()).toEqual(Object.keys(shape).sort());
  });

  it('starts from a config the server accepts', () => {
    expect(accepts(type, base)).toBe(true);
    expect(accepts(type, { ...configDefaultsFor(type, base), ...base })).toBe(true);
  });

  for (const field of fields) {
    // Switching the source of a countdown swaps the whole set of keys; the editor does that separately.
    if (field.key === 'source') continue;

    it(`${field.key} (${field.kind}): accepts what the form offers and refuses the rest`, () => {
      const { valid, invalid } = samples(field);
      for (const value of valid)
        expect(accepts(type, { ...base, [field.key]: value }), `${String(value)}`).toBe(true);
      for (const value of invalid)
        expect(accepts(type, { ...base, [field.key]: value }), `${String(value)}`).toBe(false);
    });
  }
});

describe('countdown source', () => {
  it('offers the two sources the schemas know', () => {
    const source = TILE_TYPES.countdown.fields.find((f) => f.key === 'source');
    expect(source).toEqual({ key: 'source', kind: 'enum', options: ['manual', 'calendar'] });
    expect(accepts('countdown', { source: 'manual', label: 'Holiday', target: '2026-12-24' })).toBe(true);
    expect(accepts('countdown', { source: 'calendar', sourceIds: [SOURCE] })).toBe(true);
    expect(accepts('countdown', { source: 'bogus', label: 'Holiday', target: '2026-12-24' })).toBe(false);
  });
});
