// Normalised calendar event of `GET /api/v1/data/calendar` (docs/03-tiles.md §2).
import type { SourceInfo } from './sources';

export const EVENT_STATUSES = ['confirmed', 'tentative', 'declined'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface CalendarEvent {
  /** Provider event id; unique within one source. */
  id: string;
  /** The `sources.id` of the calendar the event belongs to. */
  sourceId: string;
  /** May be empty: the tile shows a localised "(no title)". */
  title: string;
  /** Timed: ISO instant (UTC). All-day: `YYYY-MM-DD`. */
  start: string;
  /** As `start`; for all-day events the day after the last day (exclusive, as Google returns it). */
  end: string;
  allDay: boolean;
  location?: string;
  status: EventStatus;
}

/** Payload of `GET /api/v1/data/calendar`. */
export interface CalendarData {
  /** The requested sources that exist and are enabled, in the requested order. */
  sources: SourceInfo[];
  /** Merged and sorted by start; all-day events come before the timed events of their first day. */
  events: CalendarEvent[];
}
