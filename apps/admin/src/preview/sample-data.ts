import {
  localDateString,
  zonedParts,
  zonedTimeToInstant,
  type AirData,
  type AstroData,
  type CalendarData,
  type CalendarEvent,
  type DataEnvelope,
  type Locale,
  type QuoteData,
  type SourceInfo,
  type SourceRecord,
  type TaskData,
  type WeatherData,
} from '@dashboard/shared';

// Fictional payloads for the editor preview: nothing here comes from a real account or place.

export interface SampleContext {
  now: Date;
  timezone: string;
  locale: Locale;
  /** The chosen calendars and lists: their names and colours are used when a tile asks for them. */
  sources: readonly SourceRecord[];
}

const FALLBACK_COLORS = ['#4f9dff', '#ff8a4f', '#4fd18b'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` shifted by whole days. */
export function addDays(isoDate: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Local `YYYY-MM-DDTHH:mm` of an instant in `timeZone`. */
function localDateTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function sourceInfos(ids: string[], ctx: SampleContext): SourceInfo[] {
  return ids.map((id, index) => {
    const known = ctx.sources.find((source) => source.id === id);
    return {
      id,
      label: known?.label ?? `Sample ${index + 1}`,
      color: known?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? null,
    };
  });
}

function idsOf(query: Record<string, string> | undefined): string[] {
  return (query?.['sources'] ?? '').split(',').filter((id) => id !== '');
}

function weather(ctx: SampleContext): WeatherData {
  const hour = 3_600_000;
  const codes = [2, 3, 61, 61, 3, 2, 1, 0];
  const temperatures = [14, 13, 12, 11, 11, 10, 9, 9];
  const startHour = new Date(Math.floor(ctx.now.getTime() / hour) * hour);
  const today = localDateString(ctx.now, ctx.timezone);
  const hourly = codes.map((code, i) => {
    const at = new Date(startHour.getTime() + (i + 1) * hour);
    return {
      time: localDateTime(at, ctx.timezone),
      temperature: temperatures[i] ?? null,
      precipitationProbability: code === 61 ? 60 : 10,
      code,
      windSpeed: 10 + i,
      isDay: zonedParts(at, ctx.timezone).hour >= 6 && zonedParts(at, ctx.timezone).hour < 20,
    };
  });
  const dayCodes = [2, 61, 3, 0, 71, 1];
  return {
    current: {
      time: localDateTime(ctx.now, ctx.timezone),
      temperature: 14,
      feelsLike: 12,
      code: 2,
      isDay: zonedParts(ctx.now, ctx.timezone).hour >= 6 && zonedParts(ctx.now, ctx.timezone).hour < 20,
      windSpeed: 12,
      precipitation: 0,
    },
    hourly,
    daily: dayCodes.map((code, i) => ({
      date: addDays(today, i),
      code,
      min: 6 - i,
      max: 15 - i,
      precipitationProbability: code === 61 ? 70 : 10,
    })),
    place: 'Sample town',
  };
}

function air(ctx: SampleContext): AirData {
  return { time: localDateTime(ctx.now, ctx.timezone), aqi: 34, pm2_5: 8.2, pm10: 14.5 };
}

function astro(ctx: SampleContext): AstroData {
  const date = localDateString(ctx.now, ctx.timezone);
  return {
    date,
    sunrise: zonedTimeToInstant(`${date}T05:30`, ctx.timezone).toISOString(),
    sunset: zonedTimeToInstant(`${date}T19:45`, ctx.timezone).toISOString(),
    dayLengthMin: 855,
    moon: { phase: 0.42, illumination: 0.78, name: 'waxingGibbous' },
    nextPhase: { name: 'full', date: addDays(date, 3) },
  };
}

function quote(ctx: SampleContext, query: Record<string, string> | undefined): QuoteData {
  const lang: Locale = query?.['lang'] === 'en' ? 'en' : query?.['lang'] === 'sk' ? 'sk' : ctx.locale;
  return {
    id: 'sample',
    date: localDateString(ctx.now, ctx.timezone),
    lang,
    text:
      lang === 'sk'
        ? 'Ukážkový citát, ktorý slúži len na náhľad.'
        : 'A sample quote that only serves the preview.',
    author: 'Sample Author',
  };
}

function calendar(ctx: SampleContext, query: Record<string, string> | undefined): CalendarData {
  const sources = sourceInfos(idsOf(query), ctx);
  const today = localDateString(ctx.now, ctx.timezone);
  const at = (day: number, time: string) =>
    zonedTimeToInstant(`${addDays(today, day)}T${time}`, ctx.timezone).toISOString();
  const source = (n: number) => sources[n % Math.max(sources.length, 1)]?.id ?? 'sample';
  const events: CalendarEvent[] = [
    {
      id: 'e1',
      sourceId: source(0),
      title: 'Holiday',
      start: today,
      end: addDays(today, 1),
      allDay: true,
      status: 'confirmed',
    },
    {
      id: 'e2',
      sourceId: source(0),
      title: 'Team meeting',
      start: at(0, '09:30'),
      end: at(0, '10:30'),
      allDay: false,
      location: 'Room 4',
      status: 'confirmed',
    },
    {
      id: 'e3',
      sourceId: source(1),
      title: 'Lunch',
      start: at(0, '12:00'),
      end: at(0, '13:00'),
      allDay: false,
      status: 'confirmed',
    },
    {
      id: 'e4',
      sourceId: source(1),
      title: 'Dentist',
      start: at(1, '08:00'),
      end: at(1, '08:45'),
      allDay: false,
      status: 'tentative',
    },
    {
      id: 'e5',
      sourceId: source(0),
      title: 'Trip',
      start: addDays(today, 2),
      end: addDays(today, 4),
      allDay: true,
      status: 'confirmed',
    },
    {
      id: 'e6',
      sourceId: source(1),
      title: 'Concert',
      start: at(2, '18:00'),
      end: at(2, '20:00'),
      allDay: false,
      location: 'City hall',
      status: 'confirmed',
    },
  ];
  const limit = Number(query?.['limit'] ?? '');
  const upcoming =
    Number.isInteger(limit) && limit > 0
      ? events.filter((e) => e.end > ctx.now.toISOString()).slice(0, limit)
      : events;
  return { sources, events: upcoming };
}

function tasks(ctx: SampleContext, query: Record<string, string> | undefined): TaskData {
  const sources = sourceInfos(idsOf(query), ctx);
  const today = localDateString(ctx.now, ctx.timezone);
  const created = ctx.now.toISOString();
  const list = (n: number) => sources[n % Math.max(sources.length, 1)]?.id ?? 'sample';
  const items: TaskData['tasks'] = [
    {
      id: 't1',
      sourceId: list(0),
      title: 'Pay the invoice',
      due: addDays(today, -1),
      importance: 'high',
      completed: false,
      createdAt: created,
    },
    {
      id: 't2',
      sourceId: list(0),
      title: 'Buy groceries',
      due: today,
      importance: 'normal',
      completed: false,
      createdAt: created,
    },
    {
      id: 't3',
      sourceId: list(1),
      title: 'Call the dentist',
      due: addDays(today, 1),
      importance: 'normal',
      completed: false,
      createdAt: created,
    },
    {
      id: 't4',
      sourceId: list(1),
      title: 'Book tickets',
      due: addDays(today, 5),
      importance: 'low',
      completed: false,
      createdAt: created,
    },
    {
      id: 't5',
      sourceId: list(0),
      title: 'Water the plants',
      importance: 'normal',
      completed: false,
      createdAt: created,
    },
  ];
  if (query?.['completed'] === '1') {
    items.push({
      id: 't6',
      sourceId: list(0),
      title: 'Take out the bins',
      due: today,
      importance: 'normal',
      completed: true,
      createdAt: created,
    });
  }
  return { sources, tasks: items };
}

/** The sample answer of `GET /api/v1/data/<type>`, or null for a type that has no data. */
export function sampleEnvelope(
  type: string,
  query: Record<string, string> | undefined,
  ctx: SampleContext,
): DataEnvelope<unknown> | null {
  const data = (() => {
    switch (type) {
      case 'weather':
        return weather(ctx);
      case 'air':
        return air(ctx);
      case 'astro':
        return astro(ctx);
      case 'quote':
        return quote(ctx, query);
      case 'calendar':
        return calendar(ctx, query);
      case 'tasks':
        return tasks(ctx, query);
      default:
        return null;
    }
  })();
  return data === null ? null : { updatedAt: ctx.now.toISOString(), ttl: 300, data };
}
