import { localDateString, type AstroData, type DataEnvelope, type QuoteData } from '@dashboard/shared';
import { Hono } from 'hono';
import { computeAstro } from '../astro/compute';
import { requireAuth } from '../auth/middleware';
import { d1Store, loadCached } from '../cache/provider-cache';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { loadCalendarData, type CalendarQuery } from './calendar';
import { loadTaskData, type TaskQuery } from './tasks';
import { airProvider } from '../providers/open-meteo/air';
import { weatherProvider } from '../providers/open-meteo/weather';
import { quoteOfDay } from '../quotes/select';
import { readSettings } from '../settings/repository';
import type { Settings } from '../settings/schema';

/** Computed values do not expire on the server; the client refreshes every 6 h and at midnight. */
const ASTRO_TTL_SECONDS = 6 * 60 * 60;
/** One quote per local date; the client fetches again just after midnight. */
const QUOTE_TTL_SECONDS = 24 * 60 * 60;

/** `/api/v1/data/*` tile data (docs/07-api.md §3). */
export const dataRoutes = new Hono<AppEnv>();

dataRoutes.use(requireAuth('device', 'admin'));

function requireLocation(settings: Settings): NonNullable<Settings['location']> {
  if (!settings.location) {
    throw new ApiError(409, 'location_not_set', 'Set a location in settings first');
  }
  return settings.location;
}

const SOURCE_ID_PATTERN = /^src_[a-z2-7]{16}$/;
const MAX_SOURCES = 20;

/** An integer query parameter in [min, max]; `fallback` when it is absent. */
function integerParam<T extends number | null>(
  name: string,
  value: string | undefined,
  min: number,
  max: number,
  fallback: T,
): number | T {
  if (value === undefined) return fallback;
  const n = /^\d{1,4}$/.test(value) ? Number(value) : NaN;
  if (!(n >= min && n <= max)) {
    throw new ApiError(400, 'validation_error', `${name}: expected an integer from ${min} to ${max}`);
  }
  return n;
}

/** `sources=id1,id2`: 1 to 20 distinct source ids. */
function parseSourceIds(query: Record<string, string>): string[] {
  const sourceIds = [...new Set((query['sources'] ?? '').split(',').filter(Boolean))];
  if (
    sourceIds.length === 0 ||
    sourceIds.length > MAX_SOURCES ||
    !sourceIds.every((id) => SOURCE_ID_PATTERN.test(id))
  ) {
    throw new ApiError(
      400,
      'validation_error',
      `sources: expected 1 to ${MAX_SOURCES} source ids, comma-separated`,
    );
  }
  return sourceIds;
}

function parseCalendarQuery(query: Record<string, string>): CalendarQuery {
  return {
    sourceIds: parseSourceIds(query),
    days: integerParam('days', query['days'], 1, 365, 3),
    limit: integerParam('limit', query['limit'], 1, 250, null),
  };
}

function parseTaskQuery(query: Record<string, string>): TaskQuery {
  const completed = query['completed'];
  if (completed !== undefined && completed !== '0' && completed !== '1') {
    throw new ApiError(400, 'validation_error', 'completed: expected 0 or 1');
  }
  return { sourceIds: parseSourceIds(query), includeCompleted: completed === '1' };
}

/** A real calendar date `YYYY-MM-DD` between 1900 and 2199. */
function isCalendarDate(value: string): boolean {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

dataRoutes.get('/weather', async (c) => {
  const settings = await readSettings(c.env.DB);
  const { lat, lon } = requireLocation(settings);
  return c.json(
    await loadCached(d1Store(c.env.DB), weatherProvider, { lat, lon, timezone: settings.timezone }),
  );
});

dataRoutes.get('/air', async (c) => {
  const settings = await readSettings(c.env.DB);
  const { lat, lon } = requireLocation(settings);
  return c.json(await loadCached(d1Store(c.env.DB), airProvider, { lat, lon, timezone: settings.timezone }));
});

dataRoutes.get('/calendar', async (c) => {
  const query = parseCalendarQuery(c.req.query());
  const settings = await readSettings(c.env.DB);
  return c.json(await loadCalendarData(c.env, settings.timezone, query));
});

dataRoutes.get('/tasks', async (c) => c.json(await loadTaskData(c.env, parseTaskQuery(c.req.query()))));

dataRoutes.get('/astro', async (c) => {
  const date = c.req.query('date');
  if (date !== undefined && !isCalendarDate(date)) {
    throw new ApiError(400, 'validation_error', 'date: expected YYYY-MM-DD');
  }
  const settings = await readSettings(c.env.DB);
  const { lat, lon } = requireLocation(settings);
  const day = date ?? localDateString(new Date(), settings.timezone);

  const body: DataEnvelope<AstroData> = {
    updatedAt: new Date().toISOString(),
    ttl: ASTRO_TTL_SECONDS,
    data: computeAstro(day, lat, lon, settings.timezone),
  };
  return c.json(body);
});

dataRoutes.get('/quote', async (c) => {
  const lang = c.req.query('lang');
  if (lang !== undefined && lang !== 'sk' && lang !== 'en') {
    throw new ApiError(400, 'validation_error', 'lang: expected sk or en');
  }
  const settings = await readSettings(c.env.DB);
  const today = localDateString(new Date(), settings.timezone);
  const body: DataEnvelope<QuoteData> = {
    updatedAt: new Date().toISOString(),
    ttl: QUOTE_TTL_SECONDS,
    data: quoteOfDay(today, lang ?? settings.locale),
  };
  return c.json(body);
});
