import {
  configDefaultsFor,
  fieldsFor,
  isMessageKey,
  sourceKindFor,
  type MessageKey,
  type SourceKind,
  type SourceRecord,
  type Tile,
  type TileType,
} from '@dashboard/shared';

// What the editor knows about the settings of a tile beyond the registry: defaults for a new tile, what the
// server will refuse, and the message keys of the generated form.

export interface NewTileContext {
  sources: readonly SourceRecord[];
  /** Name given to a new countdown, in the language of the admin. */
  countdownLabel: string;
  now: Date;
}

export function sourcesOfKind(sources: readonly SourceRecord[], kind: SourceKind): SourceRecord[] {
  return sources.filter((source) => source.kind === kind && source.enabled);
}

/** Local `YYYY-MM-DD`, a week from `now`: a date the countdown of a new tile can show. */
export function defaultCountdownTarget(now: Date): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The config of a tile that reads the calendar or that shows one event, with the keys that need a value. */
function countdownConfig(source: 'manual' | 'calendar', context: NewTileContext): Record<string, unknown> {
  if (source === 'calendar') {
    const first = sourcesOfKind(context.sources, 'calendar')[0];
    return { ...configDefaultsFor('countdown', { source }), sourceIds: first ? [first.id] : [] };
  }
  return {
    ...configDefaultsFor('countdown', { source }),
    label: context.countdownLabel,
    target: defaultCountdownTarget(context.now),
  };
}

/** The config of a tile just added: the defaults, the first source of the right kind and the required texts. */
export function newTileConfig(type: TileType, context: NewTileContext): Record<string, unknown> {
  if (type === 'countdown') return countdownConfig('manual', context);
  const config: Record<string, unknown> = { ...configDefaultsFor(type, {}) };
  const kind = sourceKindFor(type, config);
  if (kind) {
    const first = sourcesOfKind(context.sources, kind)[0];
    config['sourceIds'] = first ? [first.id] : [];
  }
  return config;
}

/**
 * The config after one setting changed. A countdown that switches its source changes its whole set of
 * settings, so it starts over with the defaults of the new source.
 */
export function withSetting(
  tile: Tile,
  key: string,
  value: unknown,
  context: NewTileContext,
): Record<string, unknown> {
  if (tile.type === 'countdown' && key === 'source') {
    return countdownConfig(value === 'calendar' ? 'calendar' : 'manual', context);
  }
  return { ...tile.config, [key]: value };
}

const LOCAL_TARGET = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` naming a real date and time (the rule of the server). */
export function isValidTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = LOCAL_TARGET.exec(value);
  if (!match) return false;
  const [y, m, d, hh, mm] = [1, 2, 3, 4, 5].map((i) => Number(match[i] ?? 0));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m! - 1 &&
    date.getUTCDate() === d &&
    hh! < 24 &&
    mm! < 60
  );
}

/** What the server will refuse about this tile although the form let it through, as a message; else null. */
export function configProblem(tile: Tile): MessageKey | null {
  const config = tile.config;
  if (fieldsFor(tile.type, config).some((f) => f.kind === 'sources')) {
    const ids = config['sourceIds'];
    if (!Array.isArray(ids) || ids.length === 0) return 'admin.editor.needsSource';
  }
  if (tile.type === 'countdown' && config['source'] !== 'calendar') {
    const label = typeof config['label'] === 'string' ? config['label'].trim() : '';
    if (label.length < 1 || label.length > 40 || !isValidTarget(config['target'])) {
      return 'admin.editor.needsCountdown';
    }
  }
  return null;
}

/** `field.clock.showSeconds`; every key exists in both languages (checked by a test). */
export function fieldLabelKey(type: TileType, key: string): MessageKey | null {
  const name = `field.${type}.${key}`;
  return isMessageKey(name) ? name : null;
}

/** `option.sortBy.due`. */
export function optionLabelKey(key: string, option: string): MessageKey | null {
  const name = `option.${key}.${option}`;
  return isMessageKey(name) ? name : null;
}
