import {
  dayNumber,
  formatDate,
  formatTime,
  localDateString,
  t,
  type CalendarConfig,
  type CalendarData,
  type Locale,
} from '@dashboard/shared';

/** Where an event stands relative to now: it ended earlier today, is on now, or is still to come. */
export type Progress = 'past' | 'now' | 'next';

export interface AgendaEvent {
  /** `#rrggbb` of the calendar, or '' when unknown. */
  color: string;
  title: string;
  /** "09:00–09:30", "09:00", "–09:30" (started earlier) or '' for all-day events. */
  time: string;
  location: string;
  /** "day 2/3" of a multi-day all-day event, else ''. */
  note: string;
  declined: boolean;
  tentative: boolean;
  progress: Progress;
}

export interface AgendaDay {
  date: string;
  label: string;
  isToday: boolean;
  /** Shown as a strip above the timed events (docs/03-tiles.md §2). */
  allDay: AgendaEvent[];
  timed: AgendaEvent[];
}

export function addDays(isoDate: string, n: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string, locale: Locale): string {
  if (date === today) return t(locale, 'calendar.today');
  if (date === addDays(today, 1)) return t(locale, 'calendar.tomorrow');
  // Noon UTC formatted in UTC is that calendar day in every locale.
  return formatDate(new Date(`${date}T12:00:00Z`), { locale, timeZone: 'UTC', style: 'long' });
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The agenda of the next `daysAhead` local days as the tile shows it (docs/03-tiles.md §2): events grouped by
 * day, all-day events apart from the timed ones, days without events left out. A timed event that started
 * before today and still runs belongs to today; a multi-day all-day event appears on each of its days.
 */
export function buildAgenda(
  data: CalendarData,
  config: CalendarConfig,
  now: Date,
  timeZone: string,
  locale: Locale,
): AgendaDay[] {
  const today = localDateString(now, timeZone);
  const lastDay = addDays(today, config.daysAhead - 1);
  const colors = new Map(
    data.sources.map((s) => [s.id, s.color !== null && COLOR.test(s.color) ? s.color : '']),
  );
  const days = new Map<string, AgendaDay>();
  const dayOf = (date: string): AgendaDay => {
    let day = days.get(date);
    if (!day) {
      day = { date, label: dayLabel(date, today, locale), isToday: date === today, allDay: [], timed: [] };
      days.set(date, day);
    }
    return day;
  };
  const clock = (instant: Date) => formatTime(instant, { locale, timeZone, hour12: false, seconds: false });

  for (const event of data.events) {
    if (config.hideDeclined && event.status === 'declined') continue;
    const base = {
      color: colors.get(event.sourceId) ?? '',
      title: event.title || t(locale, 'calendar.noTitle'),
      location: event.location ?? '',
      declined: event.status === 'declined',
      tentative: event.status === 'tentative',
    };

    if (event.allDay) {
      const length = Math.max(1, dayNumber(event.end) - dayNumber(event.start));
      const first = event.start < today ? today : event.start;
      const last = addDays(event.start, length - 1);
      for (let date = first; date <= last && date <= lastDay; date = addDays(date, 1)) {
        dayOf(date).allDay.push({
          ...base,
          time: '',
          note:
            length > 1
              ? t(locale, 'calendar.dayOf', {
                  n: dayNumber(date) - dayNumber(event.start) + 1,
                  total: length,
                })
              : '',
          progress: 'next',
        });
      }
      continue;
    }

    const start = new Date(event.start);
    const end = new Date(event.end);
    const ended = end.getTime() <= now.getTime();
    if (config.hidePast && ended) continue;
    const startDate = localDateString(start, timeZone);
    const date = startDate < today ? today : startDate;
    if (date > lastDay) continue;

    // An end at exactly midnight still belongs to the day that ends.
    const sameDay =
      end.getTime() <= start.getTime() ||
      localDateString(new Date(end.getTime() - 1), timeZone) === startDate;
    const time =
      startDate < today
        ? `–${clock(end)}`
        : sameDay && end > start
          ? `${clock(start)}–${clock(end)}`
          : clock(start);
    dayOf(date).timed.push({
      ...base,
      time,
      note: '',
      progress: ended ? 'past' : start.getTime() <= now.getTime() ? 'now' : 'next',
    });
  }

  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The first `max` events in display order (each day: all-day events, then timed ones); null keeps all. */
export function limitAgenda(days: AgendaDay[], max: number | null): AgendaDay[] {
  if (max === null) return days;
  let left = max;
  const limited: AgendaDay[] = [];
  for (const day of days) {
    if (left <= 0) break;
    const allDay = day.allDay.slice(0, left);
    left -= allDay.length;
    const timed = day.timed.slice(0, left);
    left -= timed.length;
    limited.push({ ...day, allDay, timed });
  }
  return limited;
}
