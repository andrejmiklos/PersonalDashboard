import {
  GRID_COLS,
  GRID_ROWS,
  LAYOUT_SCHEMA_VERSION,
  MAX_TILES,
  type TileConfigs,
  type TileType,
} from '@dashboard/shared';
import { z } from 'zod';

/** Config as accepted in a request: any key may be omitted (zod types omitted keys as `undefined`). */
type ConfigInput<T extends TileType> = { [K in keyof TileConfigs[T]]?: TileConfigs[T][K] | undefined };

const bool = z.boolean().optional();
const SOURCE_ID = /^src_[a-z2-7]{16}$/;

const sourceIds = z
  .array(z.string().regex(SOURCE_ID, 'Invalid source id'))
  .min(1)
  .max(20)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate source id');

function isValidLocalTarget(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return false;
  const [y, m, d, hh, mm] = match.slice(1).map((part) => Number(part ?? 0));
  if (y === undefined || m === undefined || d === undefined || hh === undefined || mm === undefined) {
    return false;
  }
  // Round-trip through Date rejects impossible dates such as 2026-02-30.
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d &&
    hh < 24 &&
    mm < 60
  );
}

/**
 * Config schemas per tile type (docs/03-tiles.md). Keys with a registry default are optional and
 * filled on save; keys without one are required. Unknown keys are rejected.
 */
export const tileConfigSchemas = {
  clock: z.strictObject({
    format: z.enum(['24h', '12h']).optional(),
    showSeconds: bool,
    showDate: bool,
    dateStyle: z.enum(['long', 'short']).optional(),
    showWeekNumber: bool,
  }),
  calendar: z.strictObject({
    sourceIds,
    daysAhead: z.int().min(1).max(14).optional(),
    maxEvents: z.int().min(3).max(30).nullable().optional(),
    showLocation: bool,
    showLegend: bool,
    hideDeclined: bool,
    hidePast: bool,
  }),
  tasks: z.strictObject({
    sourceIds,
    maxItems: z.int().min(3).max(40).nullable().optional(),
    showDueDate: bool,
    sortBy: z.enum(['due', 'created', 'list']).optional(),
    groupByList: bool,
    showCompleted: bool,
  }),
  quote: z.strictObject({
    language: z.enum(['auto', 'sk', 'en']).optional(),
    showAuthor: bool,
  }),
  weather: z.strictObject({
    showHourly: bool,
    dailyDays: z.int().min(0).max(5).optional(),
    showFeelsLike: bool,
    showPrecipitation: bool,
    showWind: bool,
    showLocation: bool,
  }),
  astro: z.strictObject({
    showDayLength: bool,
    showMoonIllumination: bool,
    showNextPhase: bool,
  }),
  air: z.strictObject({
    showParticles: bool,
  }),
  countdown: z.strictObject({
    source: z.literal('manual').optional(),
    label: z.string().trim().min(1).max(40),
    target: z.string().refine(isValidLocalTarget, 'Expected YYYY-MM-DD or YYYY-MM-DDTHH:mm'),
    showTime: bool,
    afterBehaviour: z.enum(['hide', 'zero', 'since']).optional(),
  }),
} satisfies { [T in TileType]: z.ZodType<ConfigInput<T>> };

/** The countdown that reads the calendar (docs/03-tiles.md §8) has its own set of keys. */
const countdownCalendarSchema = z.strictObject({
  source: z.literal('calendar'),
  sourceIds,
  maxEvents: z.int().min(1).max(10).nullable().optional(),
  showTime: bool,
});

/** The config schema of a tile; for a countdown it depends on where the countdown gets its event from. */
export function configSchemaFor(
  type: TileType,
  config: Record<string, unknown>,
): z.ZodType<Record<string, unknown>> {
  return type === 'countdown' && config['source'] === 'calendar'
    ? countdownCalendarSchema
    : tileConfigSchemas[type];
}

const tileSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Tile id must be 1-32 letters, digits, _ or -'),
  type: z.enum(Object.keys(tileConfigSchemas) as [TileType, ...TileType[]]),
  x: z.int(),
  y: z.int(),
  w: z.int(),
  h: z.int(),
  config: z.record(z.string(), z.unknown()),
});

/** Body of POST and PUT (docs/07-api.md §4); id and version are server-owned. */
export const layoutInputSchema = z.strictObject({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  name: z.string().trim().min(1).max(64),
  grid: z.strictObject({
    cols: z.literal(GRID_COLS),
    rows: z.literal(GRID_ROWS),
    gap: z.int().min(0).max(32),
  }),
  theme: z.strictObject({
    accent: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Expected #rrggbb')
      .optional(),
  }),
  tiles: z.array(tileSchema).max(MAX_TILES),
});

export const layoutPutSchema = layoutInputSchema.extend({
  /** Optimistic concurrency: reject the save when the stored version differs. */
  ifVersion: z.int().min(1).optional(),
});

export type LayoutInput = z.output<typeof layoutInputSchema>;
