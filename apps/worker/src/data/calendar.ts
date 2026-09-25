import {
  localDateString,
  zonedTimeToInstant,
  type CalendarData,
  type CalendarEvent,
  type DataEnvelope,
} from '@dashboard/shared';
import { listAccounts, listSources, type Account, type Source } from '../accounts/repository';
import { loadCached } from '../cache/provider-cache';
import { sealedStore } from '../cache/sealed-store';
import { createSecretBox } from '../crypto/secret-box';
import type { Env } from '../env';
import { getAccessToken, ReauthRequiredError } from '../oauth/access-token';
import { resolveOAuthProvider } from '../oauth/registry';
import { providerFailure } from '../providers/failure';
import { fetchCalendarEvents } from '../providers/google/calendar';
import type { Provider } from '../providers/types';

/** Client polls every 120 s (docs/01-architecture.md §4). */
export const CALENDAR_TTL_SECONDS = 180;
/** Events older than this are not served while Google fails; the tablet keeps its own copy for a day. */
const CALENDAR_STALE_SECONDS = 6 * 60 * 60;

export interface CalendarQuery {
  /** Source ids in the order the tile lists them. */
  sourceIds: string[];
  /** Days from the start of today (local) to look ahead. */
  days: number;
  /** Only the first `limit` events that have not ended yet; null = everything in the range. */
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

  const accounts = new Map<string, Account>((await listAccounts(env.DB)).map((a) => [a.id, a]));
  for (const source of sources) {
    // Known before any request: the tile can ask for a reconnect at once, also while a cache would still answer.
    if (accounts.get(source.accountId)?.status !== 'ok') {
      throw providerFailure(new ReauthRequiredError(source.accountId));
    }
  }

  const box = await createSecretBox(env.TOKEN_ENC_KEY);
  const store = sealedStore(env.DB, box);
  const today = localDateString(now, timeZone);
  const params: SourceParams = {
    date: today,
    days: query.days,
    from: zonedTimeToInstant(`${today}T00:00`, timeZone),
    to: zonedTimeToInstant(`${addDays(today, query.days)}T00:00`, timeZone),
  };

  // One access token per account, shared by its calendars.
  const tokens = new Map<string, Promise<string>>();
  const accessToken = (accountId: string) => {
    let token = tokens.get(accountId);
    if (!token) {
      const { client } = resolveOAuthProvider(env, accounts.get(accountId)?.provider ?? 'google');
      token = getAccessToken(env.DB, box, client, accountId);
      tokens.set(accountId, token);
    }
    return token;
  };

  const results = await Promise.all(
    sources.map((source) =>
      loadCached(
        store,
        calendarProvider(source, () => accessToken(source.accountId)),
        params,
        now,
      ),
    ),
  );

  let events = results.flatMap((r) => r.data).sort(sorter(timeZone));
  if (query.limit !== null) {
    // All-day ends are exclusive dates, so an event ending today is over.
    events = events.filter((e) => (e.allDay ? e.end > today : Date.parse(e.end) > now.getTime()));
    events = events.slice(0, query.limit);
  }

  const stale = results.some((r) => r.stale);
  return {
    updatedAt: results.map((r) => r.updatedAt).reduce((a, b) => (a < b ? a : b)),
    ttl: CALENDAR_TTL_SECONDS,
    ...(stale && { stale: true as const }),
    data: {
      sources: sources.map((s) => ({ id: s.id, label: s.label, color: s.color })),
      events,
    },
  };
}
