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
}

export interface AstroConfig {
  showDayLength: boolean;
  showMoonIllumination: boolean;
  showNextPhase: boolean;
}

export const POLLEN_TYPES = ['alder', 'birch', 'grass', 'mugwort', 'ragweed', 'olive'] as const;
export type PollenType = (typeof POLLEN_TYPES)[number];

export interface AirConfig {
  showPollen: boolean;
  pollenTypes: PollenType[];
  showParticles: boolean;
}

export interface CountdownConfig {
  label: string;
  /** Local `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
  target: string;
  showTime: boolean;
  afterBehaviour: 'hide' | 'zero' | 'since';
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
      showWind: false,
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
    minW: 3,
    minH: 2,
    defaultW: 3,
    defaultH: 3,
    configDefaults: {
      showPollen: true,
      pollenTypes: ['birch', 'grass', 'ragweed', 'mugwort', 'alder'],
      showParticles: false,
    },
  },
  countdown: {
    type: 'countdown',
    minW: 2,
    minH: 1,
    defaultW: 3,
    defaultH: 2,
    configDefaults: { showTime: false, afterBehaviour: 'zero' },
  },
};

export function isTileType(value: unknown): value is TileType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TILE_TYPES, value);
}
