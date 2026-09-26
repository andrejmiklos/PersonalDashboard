import { fieldsFor, TILE_TYPES, type SourceRecord, type Tile, type TileType } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import {
  configProblem,
  defaultCountdownTarget,
  fieldLabelKey,
  isValidTarget,
  newTileConfig,
  optionLabelKey,
  sourcesOfKind,
  withSetting,
  type NewTileContext,
} from './tile-model';

const source = (id: string, kind: SourceRecord['kind'], enabled = true): SourceRecord => ({
  id,
  accountId: 'acc_x',
  kind,
  remoteId: id,
  label: id,
  color: null,
  enabled,
});

const context: NewTileContext = {
  sources: [
    source('src_disabled', 'calendar', false),
    source('src_cal', 'calendar'),
    source('src_list', 'task_list'),
  ],
  countdownLabel: 'Event',
  now: new Date(2026, 0, 28, 12, 0),
};

const tile = (type: TileType, config: Record<string, unknown>): Tile => ({
  id: 't',
  type,
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  config,
});

describe('sourcesOfKind', () => {
  it('keeps enabled sources of the kind', () => {
    expect(sourcesOfKind(context.sources, 'calendar').map((s) => s.id)).toEqual(['src_cal']);
    expect(sourcesOfKind(context.sources, 'task_list').map((s) => s.id)).toEqual(['src_list']);
  });
});

describe('defaultCountdownTarget', () => {
  it('is a week from now, across a month end', () => {
    expect(defaultCountdownTarget(new Date(2026, 0, 28, 12, 0))).toBe('2026-02-04');
  });
});

describe('newTileConfig', () => {
  it('starts a calendar with its first enabled calendar', () => {
    expect(newTileConfig('calendar', context)['sourceIds']).toEqual(['src_cal']);
    expect(newTileConfig('tasks', context)['sourceIds']).toEqual(['src_list']);
  });

  it('leaves the sources empty when there are none', () => {
    expect(newTileConfig('calendar', { ...context, sources: [] })['sourceIds']).toEqual([]);
  });

  it('gives a countdown the name and a date', () => {
    expect(newTileConfig('countdown', context)).toMatchObject({
      source: 'manual',
      label: 'Event',
      target: '2026-02-04',
    });
  });

  it('starts every other tile with its registry defaults', () => {
    expect(newTileConfig('clock', context)).toEqual(TILE_TYPES.clock.configDefaults);
  });

  it('has no problem for a tile with sources and a countdown with its texts', () => {
    for (const type of Object.keys(TILE_TYPES) as TileType[]) {
      expect(configProblem(tile(type, newTileConfig(type, context))), type).toBeNull();
    }
  });
});

describe('withSetting', () => {
  it('changes one setting and keeps the others', () => {
    const result = withSetting(
      tile('clock', { showSeconds: false, format: '24h' }),
      'showSeconds',
      true,
      context,
    );
    expect(result).toEqual({ showSeconds: true, format: '24h' });
  });

  it('starts a countdown over when its source changes', () => {
    const manual = tile('countdown', { source: 'manual', label: 'Trip', target: '2026-05-01' });
    const calendar = withSetting(manual, 'source', 'calendar', context);
    expect(calendar).toEqual({
      source: 'calendar',
      showTime: false,
      maxEvents: null,
      sourceIds: ['src_cal'],
    });
    expect(calendar).not.toHaveProperty('label');

    const back = withSetting(tile('countdown', calendar), 'source', 'manual', context);
    expect(back).toMatchObject({ source: 'manual', label: 'Event', target: '2026-02-04' });
    expect(back).not.toHaveProperty('sourceIds');
  });
});

describe('isValidTarget', () => {
  it('accepts a date and a date with a time', () => {
    expect(isValidTarget('2026-12-24')).toBe(true);
    expect(isValidTarget('2026-12-24T18:30')).toBe(true);
  });

  it.each([
    '',
    'tomorrow',
    '2026-02-30',
    '2026-12-24T24:00',
    '2026-12-24T18:60',
    '2026-12-24 18:30',
    5,
    null,
  ])('rejects %j', (value) => {
    expect(isValidTarget(value)).toBe(false);
  });
});

describe('configProblem', () => {
  it('asks for a source when a calendar or list tile has none', () => {
    expect(configProblem(tile('calendar', { sourceIds: [] }))).toBe('admin.editor.needsSource');
    expect(configProblem(tile('tasks', {}))).toBe('admin.editor.needsSource');
    expect(configProblem(tile('countdown', { source: 'calendar', sourceIds: [] }))).toBe(
      'admin.editor.needsSource',
    );
    expect(configProblem(tile('calendar', { sourceIds: ['src_cal'] }))).toBeNull();
  });

  it('asks for a name and a date on a countdown of one event', () => {
    expect(configProblem(tile('countdown', { source: 'manual', label: '', target: '2026-05-01' }))).toBe(
      'admin.editor.needsCountdown',
    );
    expect(configProblem(tile('countdown', { source: 'manual', label: 'Trip', target: 'soon' }))).toBe(
      'admin.editor.needsCountdown',
    );
    expect(configProblem(tile('countdown', { label: 'x'.repeat(41), target: '2026-05-01' }))).toBe(
      'admin.editor.needsCountdown',
    );
    expect(
      configProblem(tile('countdown', { source: 'manual', label: 'Trip', target: '2026-05-01' })),
    ).toBeNull();
  });

  it('has nothing to say about a tile without sources', () => {
    expect(configProblem(tile('clock', {}))).toBeNull();
  });
});

describe('message keys of the generated forms', () => {
  it('exist for every setting and every option of every tile', () => {
    for (const type of Object.keys(TILE_TYPES) as TileType[]) {
      const configs: Record<string, unknown>[] = type === 'countdown' ? [{}, { source: 'calendar' }] : [{}];
      for (const config of configs) {
        for (const field of fieldsFor(type, config)) {
          expect(fieldLabelKey(type, field.key), `${type}.${field.key}`).not.toBeNull();
          if (field.kind === 'enum') {
            for (const option of field.options) {
              expect(optionLabelKey(field.key, option), `${field.key}.${option}`).not.toBeNull();
            }
          }
        }
      }
    }
  });

  it('are null for a name that is not a message', () => {
    expect(fieldLabelKey('clock', 'nope')).toBeNull();
    expect(optionLabelKey('format', 'nope')).toBeNull();
  });
});
