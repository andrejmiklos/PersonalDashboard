// Tile type registry (docs/03-tiles.md §9): single source of truth for the editor palette,
// size limits, config defaults and server-side layout validation.

export interface ClockConfig {
  format: '24h' | '12h';
  showSeconds: boolean;
  showDate: boolean;
  dateStyle: 'long' | 'short';
  showWeekNumber: boolean;
}

export interface CalendarConfig {
  sourceIds: string[];
  daysAhead: number;
  /** null = as many as fit. */
  maxEvents: number | null;
  showLocation: boolean;
  showLegend: boolean;
  hideDeclined: boolean;
  hidePast: boolean;
}

export interface TasksConfig {
  sourceIds: string[];
  /** null = as many as fit. */
  maxItems: number | null;
  showDueDate: boolean;
  sortBy: 'due' | 'created' | 'list';
  groupByList: boolean;
  showCompleted: boolean;
}

export interface QuoteConfig {
  language: 'auto' | 'sk' | 'en';
  showAuthor: boolean;
}

export interface WeatherConfig {
  showHourly: boolean;
  dailyDays: number;
  showFeelsLike: boolean;
  showPrecipitation: boolean;
  showWind: boolean;
  showLocation: boolean;
}

export interface AstroConfig {
  showDayLength: boolean;
  showMoonIllumination: boolean;
  showNextPhase: boolean;
}

export interface AirConfig {
  showParticles: boolean;
}

/**
 * `manual`: one event given by `label` and `target`. `calendar`: the nearest events of the calendars in
 * `sourceIds`; `label`, `target` and `afterBehaviour` are not used then (docs/03-tiles.md §8).
 */
export interface CountdownConfig {
  source: 'manual' | 'calendar';
  label: string;
  /** Local `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
  target: string;
  showTime: boolean;
  afterBehaviour: 'hide' | 'zero' | 'since';
  sourceIds: string[];
  /** Calendar source: how many events at most; null = as many as fit. */
  maxEvents: number | null;
}

export interface TileConfigs {
  clock: ClockConfig;
  calendar: CalendarConfig;
  tasks: TasksConfig;
  quote: QuoteConfig;
  weather: WeatherConfig;
  astro: AstroConfig;
  air: AirConfig;
  countdown: CountdownConfig;
}

export type TileType = keyof TileConfigs;

export interface TileTypeMeta<T extends TileType = TileType> {
  type: T;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  /** Filled in on save; keys without a default (e.g. countdown label) are required. */
  configDefaults: Partial<TileConfigs[T]>;
  needsSources?: 'calendar' | 'task_list';
}

export const TILE_TYPES: { readonly [T in TileType]: TileTypeMeta<T> } = {
  clock: {
    type: 'clock',
    minW: 2,
    minH: 1,
    defaultW: 4,
    defaultH: 2,
    configDefaults: {
      format: '24h',
      showSeconds: false,
      showDate: true,
      dateStyle: 'long',
      showWeekNumber: false,
    },
  },
  calendar: {
    type: 'calendar',
    minW: 3,
    minH: 3,
    defaultW: 5,
    defaultH: 6,
    configDefaults: {
      sourceIds: [],
      daysAhead: 3,
      maxEvents: null,
      showLocation: false,
      showLegend: false,
      hideDeclined: false,
      hidePast: true,
    },
    needsSources: 'calendar',
  },
  tasks: {
    type: 'tasks',
    minW: 3,
    minH: 3,
    defaultW: 4,
    defaultH: 5,
    configDefaults: {
      sourceIds: [],
      maxItems: null,
      showDueDate: true,
      sortBy: 'due',
      groupByList: false,
      showCompleted: false,
    },
    needsSources: 'task_list',
  },
  quote: {
    type: 'quote',
    minW: 3,
    minH: 2,
    defaultW: 6,
    defaultH: 2,
    configDefaults: { language: 'auto', showAuthor: true },
  },
  weather: {
    type: 'weather',
    minW: 3,
    minH: 2,
    defaultW: 4,
    defaultH: 4,
    configDefaults: {
      showHourly: true,
      dailyDays: 3,
      showFeelsLike: true,
      showPrecipitation: true,
      showWind: true,
      showLocation: true,
    },
  },
  astro: {
    type: 'astro',
    minW: 2,
    minH: 2,
    defaultW: 3,
    defaultH: 2,
    configDefaults: { showDayLength: true, showMoonIllumination: true, showNextPhase: false },
  },
  air: {
    type: 'air',
    minW: 2,
    minH: 1,
    defaultW: 2,
    defaultH: 2,
    configDefaults: {
      showParticles: true,
    },
  },
  countdown: {
    type: 'countdown',
    minW: 2,
    minH: 1,
    defaultW: 3,
    defaultH: 2,
    configDefaults: { source: 'manual', showTime: false, afterBehaviour: 'zero' },
  },
};

const COUNTDOWN_CALENDAR_DEFAULTS: Partial<CountdownConfig> = {
  source: 'calendar',
  showTime: false,
  maxEvents: null,
};

/** Defaults of a tile's config; a countdown that reads the calendar has its own set. */
export function configDefaultsFor(type: TileType, config: Record<string, unknown>): Record<string, unknown> {
  return type === 'countdown' && config['source'] === 'calendar'
    ? COUNTDOWN_CALENDAR_DEFAULTS
    : TILE_TYPES[type].configDefaults;
}

/** The kind of sources a tile's `sourceIds` must name, or null when it needs none. */
export function sourceKindFor(
  type: TileType,
  config: Record<string, unknown>,
): 'calendar' | 'task_list' | null {
  if (type === 'countdown') return config['source'] === 'calendar' ? 'calendar' : null;
  return TILE_TYPES[type].needsSources ?? null;
}

export function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TILE_TYPES, value);
}
