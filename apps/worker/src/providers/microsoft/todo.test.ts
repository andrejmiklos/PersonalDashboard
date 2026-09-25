import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { taskListsFixture, tasksFixture } from '../../test/graph-todo';
import { ProviderError } from '../types';
import { fetchTasks, listTaskLists, mapTask, mapTaskLists, mapTasks } from './todo';

const upstream = vi.fn<typeof fetch>();

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal('fetch', upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapTaskLists', () => {
  it('keeps id and name of each list', () => {
    expect(mapTaskLists(taskListsFixture())).toEqual([
      { id: 'list-1=', label: 'Tasks' },
      { id: 'list-2=', label: 'Shopping' },
    ]);
  });

  it('falls back to the id for a blank name and rejects a broken response', () => {
    expect(mapTaskLists({ value: [{ id: 'x', displayName: '  ' }] })).toEqual([{ id: 'x', label: 'x' }]);
    expect(() => mapTaskLists({})).toThrow(ProviderError);
    expect(() => mapTaskLists({ value: [{ displayName: 'no id' }] })).toThrow(ProviderError);
  });
});

describe('mapTasks', () => {
  const tasks = mapTasks(tasksFixture(), 'src_a');
  const byId = (id: string) => tasks.find((t) => t.id === id);

  it('maps the fields the tile needs', () => {
    expect(byId('t-due')).toEqual({
      id: 't-due',
      sourceId: 'src_a',
      title: 'Call the plumber',
      due: '2026-01-16',
      importance: 'high',
      completed: false,
      createdAt: '2026-01-10T08:30:00.123Z',
    });
  });

  it('trims titles, leaves out a missing or null due date and knows low importance', () => {
    expect(byId('t-plain')).toMatchObject({ title: 'Buy milk', importance: 'normal', completed: false });
    expect(byId('t-plain')).not.toHaveProperty('due');
    expect(byId('t-low')).toMatchObject({ importance: 'low' });
    expect(byId('t-low')).not.toHaveProperty('due');
  });

  it('marks completed tasks', () => {
    expect(byId('t-done')?.completed).toBe(true);
    expect(tasks.filter((t) => t.completed)).toHaveLength(1);
  });

  it('takes the date of a due date whatever its time zone says', () => {
    const task = mapTask(
      {
        id: 'x',
        status: 'notStarted',
        dueDateTime: { dateTime: '2026-03-05T23:00:00.0000000', timeZone: 'Pacific' },
      },
      's',
    );
    expect(task?.due).toBe('2026-03-05');
  });

  it('tolerates missing optional fields and shortens long titles', () => {
    expect(mapTask({ id: 'x', status: 'notStarted' }, 's')).toEqual({
      id: 'x',
      sourceId: 's',
      title: '',
      importance: 'normal',
      completed: false,
      createdAt: '1970-01-01T00:00:00.000Z',
    });
    expect(mapTask({ id: 'x', status: 'notStarted', title: 'a'.repeat(500) }, 's')?.title).toHaveLength(200);
  });

  it('skips a single odd task but rejects a broken response', () => {
    const raw = {
      value: [{ status: 'notStarted' }, 'nope', { id: 'ok', status: 'notStarted', title: 'Fine' }],
    };
    expect(mapTasks(raw, 's').map((t) => t.id)).toEqual(['ok']);
    expect(() => mapTasks({ value: 'no' }, 's')).toThrow(ProviderError);
    expect(() => mapTasks({}, 's')).toThrow(ProviderError);
  });
});

describe('requests', () => {
  it('lists the To Do lists with the bearer token', async () => {
    upstream.mockResolvedValue(Response.json(taskListsFixture()));
    expect(await listTaskLists('access-1')).toHaveLength(2);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/todo/lists?$top=100');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });

  it('asks for the open tasks of one list, or for all of them', async () => {
    upstream.mockImplementation(async () => Response.json(tasksFixture()));
    await fetchTasks('access-1', 'list-1=', 'src_a', false);
    await fetchTasks('access-1', 'list-1=', 'src_a', true);
    const [open, all] = upstream.mock.calls.map(([input]) => String(input));
    expect(open).toBe(
      "https://graph.microsoft.com/v1.0/me/todo/lists/list-1%3D/tasks?$top=100&$filter=status%20ne%20'completed'",
    );
    expect(all).toBe('https://graph.microsoft.com/v1.0/me/todo/lists/list-1%3D/tasks?$top=100');
  });

  it('reports a refusal with status and Retry-After but without its body', async () => {
    upstream.mockResolvedValue(
      new Response('Too many requests for anna@example.com', {
        status: 429,
        headers: { 'Retry-After': '17' },
      }),
    );
    const err = await fetchTasks('access-1', 'list-1=', 'src_a', false).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'ProviderError', status: 429, retryAfterSec: 17, message: 'HTTP 429' });
  });
});
