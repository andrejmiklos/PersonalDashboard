import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarListFixture, eventsFixture } from '../../test/google-calendar';
import { ProviderError } from '../types';
import { fetchCalendarEvents, listCalendars, mapCalendarList, mapEvents } from './calendar';

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapCalendarList', () => {
  it('prefers the owner override, marks the primary calendar and keeps the colour as a suggestion', () => {
    expect(mapCalendarList(calendarListFixture())).toEqual([
      { id: 'anna@example.com', label: 'anna@example.com', primary: true, color: '#9fe1e7' },
      { id: 'family-1@group.calendar.example.com', label: 'Our family', primary: false, color: null },
      { id: 'holidays-1@group.calendar.example.com', label: 'Holidays', primary: false, color: '#b39ddb' },
    ]);
  });

  it('accepts an empty list and rejects a broken one', () => {
    expect(mapCalendarList({})).toEqual([]);
    expect(() => mapCalendarList({ items: 'nope' })).toThrow(ProviderError);
    expect(() => mapCalendarList({ items: [{ summary: 'no id' }] })).toThrow(ProviderError);
  });
});

describe('mapEvents', () => {
  const events = mapEvents(eventsFixture(), 'src_a');
  const byId = (id: string) => events.find((e) => e.id === id);

  it('turns timed events into UTC instants', () => {
    expect(byId('ev-timed')).toEqual({
      id: 'ev-timed',
      sourceId: 'src_a',
      title: 'Team sync',
      start: '2026-01-15T08:00:00.000Z',
      end: '2026-01-15T08:30:00.000Z',
      allDay: false,
      location: 'Room 4',
      status: 'confirmed',
    });
  });

  it('keeps all-day events as dates with the exclusive end', () => {
    expect(byId('ev-allday')).toEqual({
      id: 'ev-allday',
      sourceId: 'src_a',
      title: 'Trip',
      start: '2026-01-16',
      end: '2026-01-18',
      allDay: true,
      status: 'confirmed',
    });
  });

  it('derives the status from the own response and the event status', () => {
    expect(byId('ev-declined')?.status).toBe('declined');
    expect(byId('ev-tentative')?.status).toBe('tentative');
  });

  it('gives untitled events an empty title and drops cancelled ones', () => {
    expect(byId('ev-untitled')?.title).toBe('');
    expect(byId('ev-cancelled')).toBeUndefined();
    expect(events).toHaveLength(5);
  });

  it('skips a single odd event but rejects a broken list', () => {
    const raw = {
      items: [
        { id: 'no-start', summary: 'x', end: { date: '2026-01-16' } },
        { id: 'bad-time', start: { dateTime: 'soon' }, end: { dateTime: 'later' } },
        { id: 'half-day', start: { date: '2026-01-16' }, end: { dateTime: '2026-01-16T10:00:00Z' } },
        { id: 'fine', start: { date: '2026-01-16' }, end: { date: '2026-01-17' } },
        'not an object',
      ],
    };
    expect(mapEvents(raw, 's').map((e) => e.id)).toEqual(['fine']);
    expect(() => mapEvents({ items: {} }, 's')).toThrow(ProviderError);
    expect(mapEvents({}, 's')).toEqual([]);
  });

  it('shortens very long titles and locations and trims blanks', () => {
    const [event] = mapEvents(
      {
        items: [
          {
            id: 'long',
            summary: `  ${'t'.repeat(500)}  `,
            location: ' '.repeat(3),
            start: { date: '2026-01-16' },
            end: { date: '2026-01-17' },
          },
        ],
      },
      's',
    );
    expect(event?.title).toHaveLength(200);
    expect(event).not.toHaveProperty('location');
  });
});

describe('requests', () => {
  it('lists readable calendars with the bearer token and a field mask', async () => {
    upstream.mockResolvedValue(Response.json(calendarListFixture()));
    expect(await listCalendars('access-1')).toHaveLength(3);

    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    );
    expect(parsed.searchParams.get('minAccessRole')).toBe('reader');
    expect(parsed.searchParams.get('fields')).toContain('items(');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });

  it('asks for expanded events of one calendar in the given range', async () => {
    upstream.mockResolvedValue(Response.json(eventsFixture()));
    const range = { from: new Date('2026-01-14T23:00:00Z'), to: new Date('2026-01-18T23:00:00Z') };
    const events = await fetchCalendarEvents(
      'access-1',
      'family-1@group.calendar.example.com',
      range,
      'src_f',
    );
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.sourceId === 'src_f')).toBe(true);

    const url = new URL(upstream.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe('/calendar/v3/calendars/family-1%40group.calendar.example.com/events');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: '2026-01-14T23:00:00.000Z',
      timeMax: '2026-01-18T23:00:00.000Z',
      maxResults: '250',
    });
  });

  it('reports the HTTP status and Retry-After of a refusal without its body', async () => {
    upstream.mockResolvedValue(
      new Response('quota exceeded for anna@example.com', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    const err = await listCalendars('access-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 429, retryAfterSec: 30, message: 'HTTP 429' });
  });
});
