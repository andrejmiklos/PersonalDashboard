import { TILE_TYPES, type CalendarConfig, type CalendarData, type CalendarEvent } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { sizeClassOf } from '../layout/geometry';
import { calendarScale } from './calendar';
import { addDays, buildAgenda, limitAgenda } from './calendar-model';

// Fictional calendars and events used only in tests. "Now" is 11:00 in Bratislava (UTC+1), Thursday.
const TZ = 'Europe/Bratislava';
const NOW = new Date('2026-01-15T10:00:00.000Z');
const config = { ...TILE_TYPES.calendar.configDefaults, sourceIds: ['a', 'b'] } as CalendarConfig;

const timed = (
  id: string,
  sourceId: string,
  title: string,
  from: string,
  to: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  sourceId,
  title,
  start: from,
  end: to,
  allDay: false,
  status: 'confirmed',
  ...extra,
});
const allDay = (id: string, sourceId: string, title: string, from: string, to: string): CalendarEvent => ({
  id,
  sourceId,
  title,
  start: from,
  end: to,
  allDay: true,
  status: 'confirmed',
});

const data: CalendarData = {
  sources: [
    { id: 'a', label: 'Family', color: '#4f9dff' },
    { id: 'b', label: 'Work', color: '#ff8a4f' },
    { id: 'c', label: 'Odd', color: 'red' },
  ],
  events: [
    allDay('e5', 'b', 'Conference', '2026-01-14', '2026-01-17'),
    timed('e10', 'b', 'Night shift', '2026-01-14T22:00:00Z', '2026-01-15T11:00:00Z'),
    timed('e1', 'a', 'Breakfast', '2026-01-15T08:00:00Z', '2026-01-15T09:00:00Z'),
    allDay('e4', 'a', 'Holiday', '2026-01-15', '2026-01-16'),
    timed('e2', 'a', 'Standup', '2026-01-15T09:30:00Z', '2026-01-15T10:30:00Z', { location: 'Room 4' }),
    timed('e3', 'b', 'Review', '2026-01-15T12:00:00Z', '2026-01-15T13:00:00Z', { status: 'tentative' }),
    timed('e8', 'a', 'Optional', '2026-01-15T14:00:00Z', '2026-01-15T15:00:00Z', { status: 'declined' }),
    timed('e9', 'c', '', '2026-01-15T16:00:00Z', '2026-01-15T16:00:00Z'),
    timed('e6', 'b', 'Planning', '2026-01-16T09:00:00Z', '2026-01-16T10:00:00Z'),
    allDay('e11', 'a', 'Away', '2026-01-17', '2026-01-18'),
    timed('e7', 'a', 'Too far', '2026-01-18T09:00:00Z', '2026-01-18T10:00:00Z'),
  ],
};

const agenda = (overrides: Partial<CalendarConfig> = {}, locale: 'sk' | 'en' = 'en') =>
  buildAgenda(data, { ...config, ...overrides }, NOW, TZ, locale);

describe('buildAgenda', () => {
  it('groups the events by local day and leaves out days beyond the range', () => {
    const days = agenda();
    expect(days.map((d) => [d.date, d.label, d.isToday])).toEqual([
      ['2026-01-15', 'Today', true],
      ['2026-01-16', 'Tomorrow', false],
      ['2026-01-17', 'Saturday, January 17', false],
    ]);
    expect(days.flatMap((d) => [...d.allDay, ...d.timed]).some((e) => e.title === 'Too far')).toBe(false);
  });

  it('names the days in the UI language', () => {
    expect(agenda({}, 'sk').map((d) => d.label)).toEqual(['Dnes', 'Zajtra', 'Sobota 17. januára']);
  });

  it('puts all-day events in a strip apart from the timed ones', () => {
    const [today] = agenda();
    expect(today?.allDay.map((e) => e.title)).toEqual(['Conference', 'Holiday']);
    expect(today?.timed.map((e) => e.title)).toEqual([
      'Night shift',
      'Standup',
      'Review',
      'Optional',
      '(no title)',
    ]);
  });

  it('shows a multi-day all-day event on each remaining day with its position', () => {
    const [today, tomorrow] = agenda();
    expect(today?.allDay[0]).toMatchObject({ title: 'Conference', note: 'day 2/3' });
    expect(tomorrow?.allDay[0]).toMatchObject({ title: 'Conference', note: 'day 3/3' });
    expect(today?.allDay[1]?.note).toBe('');
    expect(agenda({}, 'sk')[0]?.allDay[0]?.note).toBe('deň 2/3');
  });

  it('keeps the events of the last day of a multi-day event out of the day after it', () => {
    expect(
      agenda()
        .flatMap((d) => d.allDay)
        .filter((e) => e.title === 'Conference'),
    ).toHaveLength(2);
  });

  it('formats times in the configured zone with the end when it is the same day', () => {
    const today = agenda()[0]!;
    expect(today.timed.map((e) => e.time)).toEqual([
      '–12:00',
      '10:30–11:30',
      '13:00–14:00',
      '15:00–16:00',
      '17:00',
    ]);
    expect(today.allDay.map((e) => e.time)).toEqual(['', '']);
  });

  it('shows the end of an event that stops at midnight, but only the start of one that runs over it', () => {
    const late: CalendarData = {
      sources: [],
      events: [
        timed('x', 'a', 'Late', '2026-01-15T21:00:00Z', '2026-01-15T23:00:00Z'),
        timed('y', 'a', 'Over midnight', '2026-01-15T22:00:00Z', '2026-01-16T01:00:00Z'),
      ],
    };
    const [today] = buildAgenda(late, config, NOW, TZ, 'en');
    expect(today?.timed.map((e) => e.time)).toEqual(['22:00–00:00', '23:00']);
  });

  it('marks what is over, on now and still to come', () => {
    const noHide = agenda({ hidePast: false })[0]!;
    expect(Object.fromEntries(noHide.timed.map((e) => [e.title, e.progress]))).toEqual({
      'Night shift': 'now',
      Breakfast: 'past',
      Standup: 'now',
      Review: 'next',
      Optional: 'next',
      '(no title)': 'next',
    });
  });

  it('hides events that are over unless asked to keep them', () => {
    expect(agenda()[0]?.timed.map((e) => e.title)).not.toContain('Breakfast');
    expect(agenda({ hidePast: false })[0]?.timed.map((e) => e.title)).toContain('Breakfast');
  });

  it('marks tentative and declined events and can drop the declined ones', () => {
    const today = agenda()[0]!;
    expect(today.timed.find((e) => e.title === 'Review')).toMatchObject({ tentative: true, declined: false });
    expect(today.timed.find((e) => e.title === 'Optional')).toMatchObject({ declined: true });
    expect(agenda({ hideDeclined: true })[0]?.timed.map((e) => e.title)).not.toContain('Optional');
  });

  it('takes the colour of the calendar and ignores anything that is not #rrggbb', () => {
    const today = agenda()[0]!;
    expect(today.timed.find((e) => e.title === 'Standup')?.color).toBe('#4f9dff');
    expect(today.timed.find((e) => e.title === 'Review')?.color).toBe('#ff8a4f');
    expect(today.timed.find((e) => e.title === '(no title)')?.color).toBe('');
  });

  it('carries the location and respects daysAhead', () => {
    expect(agenda()[0]?.timed.find((e) => e.title === 'Standup')?.location).toBe('Room 4');
    expect(agenda({ daysAhead: 1 }).map((d) => d.date)).toEqual(['2026-01-15']);
    expect(agenda({ daysAhead: 14 }).map((d) => d.date)).toContain('2026-01-18');
  });

  it('is empty when nothing is left to show', () => {
    expect(buildAgenda({ sources: [], events: [] }, config, NOW, TZ, 'en')).toEqual([]);
    expect(agenda({ hidePast: true, daysAhead: 1 }).length).toBeGreaterThan(0);
  });

  it('uses the local date of the zone, not of UTC', () => {
    // 23:30 UTC on the 15th is already the 16th in Bratislava.
    const late = new Date('2026-01-15T23:30:00.000Z');
    const days = buildAgenda(data, config, late, TZ, 'en');
    expect(days[0]).toMatchObject({ date: '2026-01-16', label: 'Today' });
  });
});

describe('limitAgenda', () => {
  const days = agenda();
  const count = (list: typeof days) => list.reduce((n, d) => n + d.allDay.length + d.timed.length, 0);

  it('keeps everything without a limit', () => {
    expect(limitAgenda(days, null)).toBe(days);
  });

  it('counts all-day events first, then timed ones, day by day', () => {
    const limited = limitAgenda(days, 3);
    expect(count(limited)).toBe(3);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.allDay).toHaveLength(2);
    expect(limited[0]?.timed.map((e) => e.title)).toEqual(['Night shift']);
  });

  it('continues on the next day and drops days that are cut off entirely', () => {
    const total = count(days);
    expect(count(limitAgenda(days, total))).toBe(total);
    expect(limitAgenda(days, count([days[0]!])).map((d) => d.date)).toEqual(['2026-01-15']);
    expect(limitAgenda(days, count([days[0]!]) + 1).map((d) => d.date)).toEqual(['2026-01-15', '2026-01-16']);
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('calendarScale', () => {
  const box = (w: number, h: number) => ({ refWidth: w, refHeight: h, sizeClass: sizeClassOf(w, h) });

  it('gives the minimum 3×3 tile a little under one rem and grows with the tile up to a limit', () => {
    expect(calendarScale(box(308, 288))).toBeGreaterThan(0.8);
    expect(calendarScale(box(308, 288))).toBeLessThan(1);
    expect(calendarScale(box(533, 600))).toBe(1.4);
    expect(calendarScale(box(100, 100))).toBe(0.8);
  });
});
