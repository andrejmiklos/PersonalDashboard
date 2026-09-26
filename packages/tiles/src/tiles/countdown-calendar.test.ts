import type { CalendarData, CalendarEvent } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { upcomingItems } from './countdown-calendar';

// Fictional events used only in tests. "Now" is Thursday 11:00 in Bratislava (UTC+1).
const TZ = 'Europe/Bratislava';
const NOW = new Date('2026-01-15T10:00:00.000Z');
const config = { showTime: false, maxEvents: null };

const timed = (
  id: string,
  title: string,
  from: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  sourceId: 's',
  title,
  start: from,
  end: from,
  allDay: false,
  status: 'confirmed',
  ...extra,
});
const allDay = (id: string, title: string, from: string, to: string): CalendarEvent => ({
  id,
  sourceId: 's',
  title,
  start: from,
  end: to,
  allDay: true,
  status: 'confirmed',
});

const data: CalendarData = {
  sources: [{ id: 's', label: 'Family', color: '#4f9dff' }],
  events: [
    allDay('long', 'Conference', '2026-01-14', '2026-01-20'),
    timed('run', 'Running', '2026-01-15T09:30:00Z'),
    allDay('today', 'Anna’s birthday', '2026-01-15', '2026-01-16'),
    timed('soon', 'Dentist', '2026-01-15T12:00:00Z'),
    timed('no', 'Optional', '2026-01-16T09:00:00Z', { status: 'declined' }),
    allDay('trip', 'Trip', '2026-01-19', '2026-01-25'),
    timed('late', '', '2026-03-01T09:00:00Z'),
  ],
};

describe('upcomingItems', () => {
  it('lists what has not started, nearest first; events of today are "Today!"', () => {
    expect(upcomingItems(data, config, NOW, TZ, 'en')).toEqual([
      { title: 'Anna’s birthday', value: 'Today!', unit: '' },
      { title: 'Dentist', value: 'Today!', unit: '' },
      { title: 'Trip', value: '4', unit: 'days' },
      { title: '(no title)', value: '45', unit: 'days' },
    ]);
  });

  it('leaves out events that are running, multi-day events that began earlier and declined ones', () => {
    const titles = upcomingItems(data, config, NOW, TZ, 'en').map((i) => i.title);
    expect(titles).not.toContain('Running');
    expect(titles).not.toContain('Conference');
    expect(titles).not.toContain('Optional');
  });

  it('counts calendar days in the configured zone and speaks the UI language', () => {
    expect(upcomingItems(data, config, NOW, TZ, 'sk').slice(2)).toEqual([
      { title: 'Trip', value: '4', unit: 'dni' },
      { title: '(bez názvu)', value: '45', unit: 'dní' },
    ]);
    // 23:30 UTC on the 15th is already the 16th in Bratislava: the birthday and the dentist are over.
    const late = new Date('2026-01-15T23:30:00.000Z');
    expect(upcomingItems(data, config, late, TZ, 'en')[0]).toEqual({
      title: 'Trip',
      value: '3',
      unit: 'days',
    });
  });

  it('stops at maxEvents', () => {
    expect(upcomingItems(data, { ...config, maxEvents: 2 }, NOW, TZ, 'en').map((i) => i.title)).toEqual([
      'Anna’s birthday',
      'Dentist',
    ]);
    expect(upcomingItems(data, { ...config, maxEvents: 1 }, NOW, TZ, 'en')).toHaveLength(1);
  });

  it('shows the time left with showTime', () => {
    const items = upcomingItems(data, { ...config, showTime: true }, NOW, TZ, 'en');
    expect(items[1]).toEqual({ title: 'Dentist', value: '2 h 0 min', unit: '' });
    expect(items[2]).toMatchObject({ title: 'Trip', value: '3 d 13 h 0 min' });
  });

  it('is empty when nothing is coming', () => {
    expect(upcomingItems({ sources: [], events: [] }, config, NOW, TZ, 'en')).toEqual([]);
    expect(upcomingItems({ ...data, events: [data.events[1]!] }, config, NOW, TZ, 'en')).toEqual([]);
  });
});
