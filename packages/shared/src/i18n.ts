// UI strings (SK + EN). The English dictionary defines the keys; the Slovak one must match it
// exactly (enforced by the Messages type). Tile-specific keys are added with each tile.
import type { Locale } from './locale';

/** Plural forms as returned by Intl.PluralRules; Slovak uses one / few / other. */
export interface PluralForms {
  one: string;
  few?: string;
  other: string;
}

const en = {
  'state.loading': 'Loading…',
  'state.error': 'Unavailable',
  'state.updatedAt': 'Updated {time}',
  'display.notPaired': 'This display is not paired. Open it once with its device link.',
  'display.offline': 'Offline',
  'tile.clock': 'Clock',
  'tile.calendar': 'Calendar',
  'tile.tasks': 'Tasks',
  'tile.quote': 'Quote of the day',
  'tile.weather': 'Weather',
  'tile.astro': 'Sun & moon',
  'tile.air': 'Air quality & pollen',
  'tile.countdown': 'Countdown',
  'clock.week': 'Week {n}',
  'unit.days': { one: '{n} day', other: '{n} days' },
} satisfies Record<string, string | PluralForms>;

export type Messages = { [K in keyof typeof en]: (typeof en)[K] extends string ? string : PluralForms };
export type MessageKey = keyof Messages;

const sk: Messages = {
  'state.loading': 'Načítava sa…',
  'state.error': 'Nedostupné',
  'state.updatedAt': 'Aktualizované {time}',
  'display.notPaired': 'Tento displej nie je spárovaný. Otvorte ho raz cez jeho odkaz zariadenia.',
  'display.offline': 'Offline',
  'tile.clock': 'Hodiny',
  'tile.calendar': 'Kalendár',
  'tile.tasks': 'Úlohy',
  'tile.quote': 'Citát dňa',
  'tile.weather': 'Počasie',
  'tile.astro': 'Slnko a mesiac',
  'tile.air': 'Kvalita vzduchu a peľ',
  'tile.countdown': 'Odpočet',
  'clock.week': '{n}. týždeň',
  'unit.days': { one: '{n} deň', few: '{n} dni', other: '{n} dní' },
};

const dictionaries: Record<Locale, Messages> = { en, sk };

type Params = Record<string, string | number>;

function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

const pluralRules = new Map<Locale, Intl.PluralRules>();

function pluralCategory(locale: Locale, n: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules.select(n);
}

/** Message for `key`; plural messages pick their form from `params.n`. */
export function t(locale: Locale, key: MessageKey, params: Params = {}): string {
  const message = dictionaries[locale][key];
  if (typeof message === 'string') {
    return interpolate(message, params);
  }
  const n = typeof params['n'] === 'number' ? params['n'] : 0;
  const category = pluralCategory(locale, n);
  const form =
    category === 'one' ? message.one : category === 'few' ? (message.few ?? message.other) : message.other;
  return interpolate(form, params);
}
