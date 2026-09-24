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
  'display.notPaired': 'This display is not paired. Create a pairing code (npm run pair) and enter it here.',
  'display.badLink': 'The link does not contain a valid device token. Check it and open it again.',
  'display.tokenRejected': 'The server rejected the device token (wrong or revoked). Pair the display again.',
  'pair.placeholder': 'Pairing code',
  'pair.submit': 'Pair',
  'pair.invalid': 'Invalid or expired code.',
  'pair.failed': 'The server is not reachable. Try again.',
  'display.offline': 'Offline',
  'display.noLayout': 'No layout is selected for this display.',
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
  'weather.clear': 'Clear',
  'weather.mainlyClear': 'Mainly clear',
  'weather.partlyCloudy': 'Partly cloudy',
  'weather.overcast': 'Overcast',
  'weather.fog': 'Fog',
  'weather.drizzle': 'Drizzle',
  'weather.freezingDrizzle': 'Freezing drizzle',
  'weather.rain': 'Rain',
  'weather.freezingRain': 'Freezing rain',
  'weather.snow': 'Snow',
  'weather.snowGrains': 'Snow grains',
  'weather.rainShowers': 'Rain showers',
  'weather.snowShowers': 'Snow showers',
  'weather.thunderstorm': 'Thunderstorm',
  'weather.thunderstormHail': 'Thunderstorm with hail',
  'weather.unknown': 'Unknown',
  'weather.feelsLike': 'Feels like {t}',
  'weather.precipitation': 'Precip. {p}',
  'weather.wind': 'Wind {v} km/h',
  'weather.today': 'Today',
  'data.noLocation': 'Set a location in the admin settings.',
  'weather.attribution': 'Weather data by Open-Meteo.com',
  'astro.dayLength': 'Day length {v}',
  'astro.duration': '{h} h {m} min',
  'astro.next': 'Next: {phase}, {date}',
  'astro.polarDay': 'The sun does not set',
  'astro.polarNight': 'The sun does not rise',
  'moon.new': 'New moon',
  'moon.waxingCrescent': 'Waxing crescent',
  'moon.firstQuarter': 'First quarter',
  'moon.waxingGibbous': 'Waxing gibbous',
  'moon.full': 'Full moon',
  'moon.waningGibbous': 'Waning gibbous',
  'moon.lastQuarter': 'Last quarter',
  'moon.waningCrescent': 'Waning crescent',
} satisfies Record<string, string | PluralForms>;

export type Messages = { [K in keyof typeof en]: (typeof en)[K] extends string ? string : PluralForms };
export type MessageKey = keyof Messages;

const sk: Messages = {
  'state.loading': 'Načítava sa…',
  'state.error': 'Nedostupné',
  'state.updatedAt': 'Aktualizované {time}',
  'display.notPaired':
    'Tento displej nie je spárovaný. Vytvorte párovací kód (npm run pair) a zadajte ho sem.',
  'display.badLink': 'Odkaz neobsahuje platný token zariadenia. Skontrolujte ho a otvorte znova.',
  'display.tokenRejected':
    'Server odmietol token zariadenia (nesprávny alebo zrušený). Spárujte displej znova.',
  'pair.placeholder': 'Párovací kód',
  'pair.submit': 'Spárovať',
  'pair.invalid': 'Neplatný alebo expirovaný kód.',
  'pair.failed': 'Server je nedostupný. Skúste znova.',
  'display.offline': 'Offline',
  'display.noLayout': 'Pre tento displej nie je vybraný žiadny layout.',
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
  'weather.clear': 'Jasno',
  'weather.mainlyClear': 'Prevažne jasno',
  'weather.partlyCloudy': 'Polojasno',
  'weather.overcast': 'Zamračené',
  'weather.fog': 'Hmla',
  'weather.drizzle': 'Mrholenie',
  'weather.freezingDrizzle': 'Mrznúce mrholenie',
  'weather.rain': 'Dážď',
  'weather.freezingRain': 'Mrznúci dážď',
  'weather.snow': 'Sneženie',
  'weather.snowGrains': 'Snehové zrná',
  'weather.rainShowers': 'Prehánky',
  'weather.snowShowers': 'Snehové prehánky',
  'weather.thunderstorm': 'Búrka',
  'weather.thunderstormHail': 'Búrka s krúpami',
  'weather.unknown': 'Neznáme',
  'weather.feelsLike': 'Pocitovo {t}',
  'weather.precipitation': 'Zrážky {p}',
  'weather.wind': 'Vietor {v} km/h',
  'weather.today': 'Dnes',
  'data.noLocation': 'Nastavte polohu v nastaveniach administrácie.',
  'weather.attribution': 'Údaje o počasí: Open-Meteo.com',
  'astro.dayLength': 'Dĺžka dňa {v}',
  'astro.duration': '{h} h {m} min',
  'astro.next': 'Najbližšie: {phase}, {date}',
  'astro.polarDay': 'Slnko nezapadá',
  'astro.polarNight': 'Slnko nevychádza',
  'moon.new': 'Nov',
  'moon.waxingCrescent': 'Dorastajúci kosák',
  'moon.firstQuarter': 'Prvá štvrť',
  'moon.waxingGibbous': 'Dorastajúci mesiac',
  'moon.full': 'Spln',
  'moon.waningGibbous': 'Ubúdajúci mesiac',
  'moon.lastQuarter': 'Posledná štvrť',
  'moon.waningCrescent': 'Ubúdajúci kosák',
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
