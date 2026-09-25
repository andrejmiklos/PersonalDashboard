import {
  localDateString,
  zonedTimeToInstant,
  type CalendarData,
  type CalendarEvent,
  type DataEnvelope,
} from '@dashboard/shared';
import { listSources, type Source } from '../accounts/repository';
import { loadCached } from '../cache/provider-cache';
import type { Env } from '../env';
import { fetchCalendarEvents } from '../providers/google/calendar';
import type { Provider } from '../providers/types';
import { mergedMeta, openSources, sourceInfos } from './source-access';

/** Client polls every 120 s (docs/01-architecture.md §4). */
export const CALENDAR_TTL_SECONDS = 180;
/** Events older than this are not served while Google fails; the tablet keeps its own copy for a day. */
const CALENDAR_STALE_SECONDS = 6 * 60 * 60;

export interface CalendarQuery {
  /** Source ids in the order the tile lists them. */
  sourceIds: string[];
  /** Days from the start of today (local) to look ahead. */
  days: number;
  /** Only the first `limit` events that have not started yet (all-day events of today count); null = everything in the range. */
  limit: number | null;
}

interface SourceParams {
  /** Local date of the request: a new day starts a new cache entry. */
  date: string;
  days: number;
  from: Date;
  to: Date;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** All events of one calendar in the range, cached sealed per source and range. */
function calendarProvider(
  source: Source,
  accessToken: () => Promise<string>,
): Provider<SourceParams, CalendarEvent[]> {
  return {
    name: 'google-calendar',
    ttlSeconds: CALENDAR_TTL_SECONDS,
    staleSeconds: CALENDAR_STALE_SECONDS,
    cacheKey: ({ date, days }) => `calendar:v1:${source.id}:${date}:${days}`,
    fetch: async ({ from, to }) =>
      fetchCalendarEvents(await accessToken(), source.remoteId, { from, to }, source.id),
  };
}

/** Chronological order; on the same day all-day events come first, then by title. */
function sorter(timeZone: string): (a: CalendarEvent, b: CalendarEvent) => number {
  const startOf = (e: CalendarEvent) =>
    e.allDay ? zonedTimeToInstant(`${e.start}T00:00`, timeZone).getTime() : Date.parse(e.start);
  return (a, b) =>
    startOf(a) - startOf(b) ||
    Number(b.allDay) - Number(a.allDay) ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);
}

/**
 * Calendar tile data (docs/03-tiles.md §2): the events of the requested calendars from the start of today,
 * merged and sorted. Every calendar has its own sealed cache entry, so tiles asking for the same range share it.
 * If any calendar can neither be fetched nor served from its cache, the whole request fails: an agenda that
 * silently misses a calendar would be worse than the tablet's own last full copy.
 */
export async function loadCalendarData(
  env: Env,
  timeZone: string,
  query: CalendarQuery,
  now: Date = new Date(),
): Promise<DataEnvelope<CalendarData>> {
  const found = await listSources(env.DB, { kind: 'calendar', ids: query.sourceIds, enabledOnly: true });
  const sources = query.sourceIds.flatMap((id) => found.find((s) => s.id === id) ?? []);
  if (sources.length === 0) {
    return { updatedAt: now.toISOString(), ttl: CALENDAR_TTL_SECONDS, data: { sources: [], events: [] } };
  }

  const { store, accessToken } = await openSources(env, sources);
  const today = localDateString(now, timeZone);
  const params: SourceParams = {
    date: today,
    days: query.days,
    from: zonedTimeToInstant(`${today}T00:00`, timeZone),
    to: zonedTimeToInstant(`${addDays(today, query.days)}T00:00`, timeZone),
  };

  const results = await Promise.all(
    sources.map((source) =>
      loadCached(
        store,
        calendarProvider(source, () => accessToken(source)),
        params,
        now,
      ),
    ),
  );

  let events = results.flatMap((r) => r.data).sort(sorter(timeZone));
  if (query.limit !== null) {
    events = events.filter((e) => (e.allDay ? e.start >= today : Date.parse(e.start) > now.getTime()));
    events = events.slice(0, query.limit);
  }

  return {
    ...mergedMeta(results),
    ttl: CALENDAR_TTL_SECONDS,
    data: { sources: sourceInfos(sources), events },
  };
}
