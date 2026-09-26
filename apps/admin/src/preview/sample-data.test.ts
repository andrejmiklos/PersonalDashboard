import type { CalendarData, QuoteData, SourceRecord, TaskData, WeatherData } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { addDays, sampleEnvelope, type SampleContext } from './sample-data';

const source = (id: string, label: string, color: string): SourceRecord => ({
  id,
  accountId: 'acc_x',
  kind: 'calendar',
  remoteId: id,
  label,
  color,
  enabled: true,
});

const ctx: SampleContext = {
  now: new Date('2026-01-15T10:00:00.000Z'),
  timezone: 'UTC',
  locale: 'en',
  sources: [source('src_a', 'Family', '#112233')],
};

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('sampleEnvelope', () => {
  it('has a payload for each tile type that reads data', () => {
    for (const type of ['weather', 'air', 'astro', 'quote', 'calendar', 'tasks']) {
      const envelope = sampleEnvelope(type, { sources: 'src_a' }, ctx);
      expect(envelope, type).not.toBeNull();
      expect(envelope?.updatedAt).toBe(ctx.now.toISOString());
      expect(envelope?.ttl).toBeGreaterThan(0);
    }
  });

  it('has none for a type without data', () => {
    expect(sampleEnvelope('clock', undefined, ctx)).toBeNull();
  });

  it('gives the weather the shape the tile reads', () => {
    const data = sampleEnvelope('weather', undefined, ctx)?.data as WeatherData;
    expect(data.hourly).toHaveLength(8);
    expect(data.daily).toHaveLength(6);
    expect(data.daily[0]?.date).toBe('2026-01-15');
    expect(data.current.time).toBe('2026-01-15T10:00');
    expect(data.hourly[0]?.time).toBe('2026-01-15T11:00');
    expect(data.place).toBe('Sample town');
  });

  it('answers the quote in the requested language', () => {
    expect((sampleEnvelope('quote', { lang: 'sk' }, ctx)?.data as QuoteData).lang).toBe('sk');
    expect((sampleEnvelope('quote', undefined, ctx)?.data as QuoteData).lang).toBe('en');
  });

  it('uses the names and colours of the requested calendars, in order', () => {
    const data = sampleEnvelope('calendar', { sources: 'src_a,src_other' }, ctx)?.data as CalendarData;
    expect(data.sources).toEqual([
      { id: 'src_a', label: 'Family', color: '#112233' },
      { id: 'src_other', label: 'Sample 2', color: '#ff8a4f' },
    ]);
    expect(new Set(data.events.map((e) => e.sourceId))).toEqual(new Set(['src_a', 'src_other']));
  });

  it('limits the events to the ones that have not ended', () => {
    const data = sampleEnvelope('calendar', { sources: 'src_a', limit: '2' }, ctx)?.data as CalendarData;
    expect(data.events).toHaveLength(2);
  });

  it('lists open tasks, and a completed one on request', () => {
    const open = sampleEnvelope('tasks', { sources: 'src_a', completed: '0' }, ctx)?.data as TaskData;
    expect(open.tasks.every((task) => !task.completed)).toBe(true);
    const all = sampleEnvelope('tasks', { sources: 'src_a', completed: '1' }, ctx)?.data as TaskData;
    expect(all.tasks.some((task) => task.completed)).toBe(true);
  });

  it('works without any requested source', () => {
    const data = sampleEnvelope('calendar', undefined, ctx)?.data as CalendarData;
    expect(data.sources).toEqual([]);
    expect(data.events.length).toBeGreaterThan(0);
  });
});
