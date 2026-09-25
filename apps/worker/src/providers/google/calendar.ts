import type { CalendarEvent, EventStatus } from '@dashboard/shared';
import { z } from 'zod';
import { fetchJson, ProviderError } from '../types';

const API = 'https://www.googleapis.com/calendar/v3';
const MAX_TITLE = 200;
const MAX_LOCATION = 200;
/** Google's page size limit for events; one page per calendar is enough for a wall display. */
export const MAX_EVENTS_PER_CALENDAR = 250;

/** A calendar of an account as discovered for the admin. */
export interface RemoteCalendar {
  id: string;
  label: string;
  primary: boolean;
  /** Google's own colour, only a suggestion: the owner picks the colour of a source. */
  color: string | null;
}

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        primary: z.boolean().optional(),
        backgroundColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
    )
    .default([]),
});

/** Validates a `calendarList` response and maps it (docs/05-integrations.md §1.3). */
export function mapCalendarList(raw: unknown): RemoteCalendar[] {
  const parsed = calendarListSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProviderError(
      `Unexpected calendar list at ${parsed.error.issues[0]?.path.join('.') || '(root)'}`,
    );
  }
  return parsed.data.items.map((item) => ({
    id: item.id,
    label: item.summaryOverride ?? item.summary ?? item.id,
    primary: item.primary === true,
    color: item.backgroundColor?.toLowerCase() ?? null,
  }));
}

/** Calendars the account can at least read. */
export async function listCalendars(accessToken: string): Promise<RemoteCalendar[]> {
  const query = new URLSearchParams({
    minAccessRole: 'reader',
    maxResults: '250',
    fields: 'items(id,summary,summaryOverride,primary,backgroundColor)',
  });
  const raw = await fetchJson(`${API}/users/me/calendarList?${query.toString()}`, {
    Authorization: `Bearer ${accessToken}`,
  });
  return mapCalendarList(raw);
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.object({ date: dateOnly.optional(), dateTime: z.string().optional() });

const eventSchema = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  start: timeSchema,
  end: timeSchema,
  attendees: z
    .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
    .optional(),
});

const eventListSchema = z.object({ items: z.array(z.unknown()).default([]) });

function instant(text: string): string | null {
  const time = new Date(text);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}

function statusOf(event: z.output<typeof eventSchema>): EventStatus | 'cancelled' {
  if (event.status === 'cancelled') return 'cancelled';
  const own = event.attendees?.find((a) => a.self === true)?.responseStatus;
  if (own === 'declined') return 'declined';
  if (own === 'tentative' || event.status === 'tentative') return 'tentative';
  return 'confirmed';
}

/**
 * Maps the events of one calendar. The list itself must have the expected shape, but a single odd event
 * (no start, unparsable time) is skipped instead of failing the whole calendar. Cancelled events are dropped.
 * Timed events become UTC instants; all-day events keep their dates, the end exclusive as Google sends it.
 */
export function mapEvents(raw: unknown, sourceId: string): CalendarEvent[] {
  const list = eventListSchema.safeParse(raw);
  if (!list.success) {
    throw new ProviderError('Unexpected event list shape');
  }
  const events: CalendarEvent[] = [];
  for (const item of list.data.items) {
    const parsed = eventSchema.safeParse(item);
    if (!parsed.success) continue;
    const { start, end } = parsed.data;
    const status = statusOf(parsed.data);
    if (status === 'cancelled') continue;

    let from: string | null;
    let to: string | null;
    const allDay = start.date !== undefined && end.date !== undefined;
    if (allDay) {
      from = start.date ?? null;
      to = end.date ?? null;
    } else {
      from = start.dateTime ? instant(start.dateTime) : null;
      to = end.dateTime ? instant(end.dateTime) : null;
    }
    if (from === null || to === null) continue;

    const location = parsed.data.location?.trim().slice(0, MAX_LOCATION);
    events.push({
      id: parsed.data.id,
      sourceId,
      title: (parsed.data.summary ?? '').trim().slice(0, MAX_TITLE),
      start: from,
      end: to,
      allDay,
      ...(location ? { location } : {}),
      status,
    });
  }
  return events;
}

/** Events of one calendar between two instants, recurring events expanded, ordered by start. */
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  range: { from: Date; to: Date },
  sourceId: string,
): Promise<CalendarEvent[]> {
  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: range.from.toISOString(),
    timeMax: range.to.toISOString(),
    maxResults: String(MAX_EVENTS_PER_CALENDAR),
    fields: 'items(id,summary,start,end,location,status,attendees(self,responseStatus))',
  });
  const raw = await fetchJson(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
    {
      Authorization: `Bearer ${accessToken}`,
    },
  );
  return mapEvents(raw, sourceId);
}
