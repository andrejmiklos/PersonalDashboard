// Fictional Microsoft Graph responses used only in tests.

export function taskListsFixture() {
  return {
    value: [
      { id: 'list-1=', displayName: 'Tasks', wellknownListName: 'defaultList' },
      { id: 'list-2=', displayName: 'Shopping', wellknownListName: 'none' },
    ],
  };
}

/** Open and completed tasks, one of each interesting kind. */
export function tasksFixture() {
  return {
    value: [
      {
        id: 't-due',
        title: 'Call the plumber',
        status: 'notStarted',
        importance: 'high',
        createdDateTime: '2026-01-10T08:30:00.1234567Z',
        dueDateTime: { dateTime: '2026-01-16T00:00:00.0000000', timeZone: 'UTC' },
      },
      {
        id: 't-plain',
        title: '  Buy milk  ',
        status: 'inProgress',
        importance: 'normal',
        createdDateTime: '2026-01-11T09:00:00Z',
      },
      {
        id: 't-low',
        title: 'Sort photos',
        status: 'notStarted',
        importance: 'low',
        createdDateTime: '2026-01-12T09:00:00Z',
        dueDateTime: null,
      },
      {
        id: 't-done',
        title: 'Pay the bill',
        status: 'completed',
        importance: 'normal',
        createdDateTime: '2026-01-09T09:00:00Z',
      },
    ],
  };
}
