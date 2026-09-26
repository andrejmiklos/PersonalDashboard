import { TILE_TYPES, type CountdownConfig } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import { countdownView } from './countdown-view';

const TZ = 'Europe/Bratislava';
const base = { ...TILE_TYPES.countdown.configDefaults, label: 'Holiday' } as CountdownConfig;
const at = (iso: string) => new Date(iso);

describe('countdownView with a date', () => {
  const config = { ...base, target: '2026-12-24' };

  it('counts calendar days in the configured zone', () => {
    // 23:30 UTC on the 21st is already the 22nd in Bratislava.
    expect(countdownView(at('2026-12-21T23:30:00Z'), config, TZ, 'sk')).toEqual({
      hidden: false,
      value: '2',
      unit: 'dni',
    });
    expect(countdownView(at('2026-12-19T10:00:00Z'), config, TZ, 'sk').unit).toBe('dní');
    expect(countdownView(at('2026-12-23T10:00:00Z'), config, TZ, 'en')).toMatchObject({
      value: '1',
      unit: 'day',
    });
  });

  it('says "today" for the whole day', () => {
    expect(countdownView(at('2026-12-24T22:30:00Z'), config, TZ, 'sk')).toMatchObject({
      value: 'Dnes!',
      unit: '',
    });
  });

  it('stays at zero by default after the day', () => {
    expect(countdownView(at('2026-12-26T10:00:00Z'), config, TZ, 'en')).toMatchObject({
      value: '0',
      unit: 'days',
    });
  });

  it('hides or counts up after the day when configured', () => {
    expect(
      countdownView(at('2026-12-26T10:00:00Z'), { ...config, afterBehaviour: 'hide' }, TZ, 'en').hidden,
    ).toBe(true);
    expect(
      countdownView(at('2026-12-29T10:00:00Z'), { ...config, afterBehaviour: 'since' }, TZ, 'sk'),
    ).toMatchObject({ value: '5', unit: 'dní odvtedy' });
  });

  it('shows the time left to the start of the day with showTime', () => {
    // 22:00 local on the 22nd → 26 h to midnight of the 24th.
    expect(countdownView(at('2026-12-22T21:00:00Z'), { ...config, showTime: true }, TZ, 'en').value).toBe(
      '1 d 2 h 0 min',
    );
  });
});

describe('countdownView with a date and time', () => {
  const config = { ...base, target: '2026-12-24T18:00' };

  it('is "today" before the time and passed after it', () => {
    expect(countdownView(at('2026-12-24T16:59:00Z'), config, TZ, 'en').value).toBe('Today!');
    expect(countdownView(at('2026-12-24T17:00:00Z'), config, TZ, 'en').value).toBe('0');
  });

  it('counts hours and minutes with showTime', () => {
    expect(countdownView(at('2026-12-24T14:25:00Z'), { ...config, showTime: true }, TZ, 'en').value).toBe(
      '2 h 35 min',
    );
  });

  it('counts up with since and showTime', () => {
    const since = { ...config, showTime: true, afterBehaviour: 'since' as const };
    expect(countdownView(at('2026-12-24T18:10:00Z'), since, TZ, 'en').value).toBe('1 h 10 min');
  });

  it('keeps the local time across a DST change', () => {
    // Europe switches to summer time on 2027-03-28; 12:00 local is 10:00 UTC afterwards.
    const spring = { ...base, target: '2027-03-29T12:00', showTime: true };
    expect(countdownView(at('2027-03-27T10:00:00Z'), spring, TZ, 'en').value).toBe('2 d 0 h 0 min');
  });
});

describe('countdownView with a broken target', () => {
  it('shows a dash instead of failing', () => {
    expect(countdownView(at('2026-12-24T10:00:00Z'), { ...base, target: 'soon' }, TZ, 'en')).toEqual({
      hidden: false,
      value: '–',
      unit: '',
    });
  });
});
