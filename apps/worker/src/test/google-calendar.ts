// Fictional Google Calendar API responses used only in tests.

export function calendarListFixture() {
  return {
    items: [
      { id: 'anna@example.com', summary: 'anna@example.com', primary: true, backgroundColor: '#9FE1E7' },
      { id: 'family-1@group.calendar.example.com', summary: 'Family', summaryOverride: 'Our family' },
      { id: 'holidays-1@group.calendar.example.com', summary: 'Holidays', backgroundColor: '#B39DDB' },
    ],
  };
}

/** One of each kind of event, with times in Europe/Bratislava (UTC+1 in January). */
export function eventsFixture() {
  return {
    items: [
      {
        id: 'ev-timed',
        summary: 'Team sync',
        location: 'Room 4',
        start: { dateTime: '2026-01-15T09:00:00+01:00', timeZone: 'Europe/Bratislava' },
        end: { dateTime: '2026-01-15T09:30:00+01:00' },
        attendees: [{ responseStatus: 'accepted' }, { self: true, responseStatus: 'accepted' }],
      },
      {
        id: 'ev-allday',
        summary: 'Trip',
        start: { date: '2026-01-16' },
        end: { date: '2026-01-18' },
      },
      {
        id: 'ev-declined',
        summary: 'Optional workshop',
        start: { dateTime: '2026-01-15T14:00:00+01:00' },
        end: { dateTime: '2026-01-15T15:00:00+01:00' },
        attendees: [{ self: true, responseStatus: 'declined' }],
      },
      {
        id: 'ev-tentative',
        summary: 'Maybe lunch',
        status: 'tentative',
        start: { dateTime: '2026-01-15T12:00:00Z' },
        end: { dateTime: '2026-01-15T13:00:00Z' },
      },
      {
        id: 'ev-untitled',
        start: { dateTime: '2026-01-15T16:00:00Z' },
        end: { dateTime: '2026-01-15T17:00:00Z' },
      },
      {
        id: 'ev-cancelled',
        summary: 'Cancelled',
        status: 'cancelled',
        start: { dateTime: '2026-01-15T18:00:00Z' },
        end: { dateTime: '2026-01-15T19:00:00Z' },
      },
    ],
  };
}
