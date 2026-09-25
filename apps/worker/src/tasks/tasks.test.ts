import type { DataEnvelope, TaskData, TaskItem } from '@dashboard/shared';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccount, updateSource, upsertAccount, upsertSource, type Source } from '../accounts/repository';
import { createSecretBox, toBase64 } from '../crypto/secret-box';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';

// Fictional origin, credentials, lists and tasks used only in tests.
const ORIGIN = 'https://dashboard.example.com';
const ENC_KEY = toBase64(new Uint8Array(32).fill(8));
const T0 = new Date('2026-01-15T10:00:00.000Z');
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0/me/todo/lists/';

const task = (id: string, title: string, created: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  status: 'notStarted',
  importance: 'normal',
  createdDateTime: created,
  ...extra,
});
const due = (day: string) => ({ dueDateTime: { dateTime: `${day}T00:00:00.0000000`, timeZone: 'UTC' } });

const LISTS: Record<string, unknown[]> = {
  'list-a=': [
    task('a1', 'No due date', '2026-01-01T08:00:00Z'),
    task('a2', 'Due later', '2026-01-02T08:00:00Z', due('2026-01-20')),
    task('a3', 'Done already', '2026-01-03T08:00:00Z', { status: 'completed' }),
  ],
  'list-b=': [
    task('b1', 'Due first', '2026-01-05T08:00:00Z', due('2026-01-16')),
    task('b2', 'Due later too', '2026-01-04T08:00:00Z', due('2026-01-20')),
  ],
};

let sqlite: DatabaseSync;
let env: Env;
let accountId: string;
let listA: Source;
let listB: Source;
let graphFails: Set<string>;
let patchStatus: number;
const upstream = vi.fn<typeof fetch>();
const errorLog = vi.spyOn(console, 'error');

const graphCalls = (method: string) =>
  upstream.mock.calls.filter(
    ([input, init]) => String(input).startsWith(GRAPH) && (init?.method ?? 'GET') === method,
  );
const refreshCalls = () => upstream.mock.calls.filter(([input]) => String(input) === TOKEN_URL);

async function call(
  method: string,
  path: string,
  init: { token?: string | null; body?: unknown; raw?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (init.token !== null) headers['Authorization'] = `Bearer ${init.token ?? DEVICE_TOKEN}`;
  let body: string | null = null;
  if (init.body !== undefined || init.raw !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = init.raw ?? JSON.stringify(init.body);
  }
  return worker.fetch(new Request(`${ORIGIN}/api/v1${path}`, { method, headers, body }), env);
}

async function load(query: string) {
  const res = await call('GET', `/data/tasks${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as DataEnvelope<TaskData>;
}

const both = () => `?sources=${listA.id},${listB.id}`;
const advanceSeconds = (n: number) => vi.setSystemTime(new Date(T0.getTime() + n * 1000));
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  sqlite = migrate();
  env = {
    DB: createTestD1(sqlite),
    TOKEN_ENC_KEY: ENC_KEY,
    MS_CLIENT_ID: 'client-1',
    MS_CLIENT_SECRET: 'secret-1',
  } as Env;
  await seedTokens(sqlite);

  accountId = (
    await upsertAccount(
      env.DB,
      await createSecretBox(ENC_KEY),
      { provider: 'microsoft', externalId: 'ms-1', displayName: null, refreshToken: 'rt-1', scopes: 'x' },
      T0,
    )
  ).id;
  listA = await upsertSource(env.DB, {
    accountId,
    kind: 'task_list',
    remoteId: 'list-a=',
    label: 'Home',
    color: '#4f9dff',
  });
  listB = await upsertSource(env.DB, {
    accountId,
    kind: 'task_list',
    remoteId: 'list-b=',
    label: 'Work',
    color: '#ff8a4f',
  });

  graphFails = new Set();
  patchStatus = 200;
  upstream.mockReset();
  upstream.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      return Response.json({ access_token: 'access-1', expires_in: 3600, refresh_token: 'rt-next' });
    }
    if (!url.startsWith(GRAPH)) return new Response('unexpected', { status: 500 });
    const [listId, , taskId] = url.slice(GRAPH.length).split('?')[0]!.split('/').map(decodeURIComponent);
    if (graphFails.has(listId!)) return new Response('backend error for anna@example.com', { status: 500 });
    if (init?.method === 'PATCH') {
      if (patchStatus !== 200) return new Response('nope', { status: patchStatus });
      const found = (LISTS[listId!] ?? []).find((t) => (t as { id: string }).id === taskId) as
        object | undefined;
      const status = (JSON.parse(String(init.body)) as { status: string }).status;
      return Response.json({ ...(found ?? task(taskId!, 'Unknown', '2026-01-01T00:00:00Z')), status });
    }
    // Like Graph, honour the filter for open tasks.
    const openOnly = decodeURIComponent(url).includes("status ne 'completed'");
    const tasks = (LISTS[listId!] ?? []).filter(
      (t) => !openOnly || (t as { status: string }).status !== 'completed',
    );
    return Response.json({ value: tasks });
  });
  vi.stubGlobal('fetch', upstream);
  errorLog.mockReset().mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GET /api/v1/data/tasks', () => {
  it('merges the lists ordered by due date, tasks without one last, and lists the sources', async () => {
    const { data, ttl, stale } = await load(both());
    expect(data.tasks.map((t) => t.id)).toEqual(['b1', 'a2', 'b2', 'a1']);
    expect(data.tasks[0]).toEqual({
      id: 'b1',
      sourceId: listB.id,
      title: 'Due first',
      due: '2026-01-16',
      importance: 'normal',
      completed: false,
      createdAt: '2026-01-05T08:00:00.000Z',
    });
    expect(data.sources).toEqual([
      { id: listA.id, label: 'Home', color: '#4f9dff' },
      { id: listB.id, label: 'Work', color: '#ff8a4f' },
    ]);
    expect(ttl).toBe(60);
    expect(stale).toBeUndefined();
  });

  it('asks Graph for open tasks only, unless completed ones are wanted', async () => {
    await load(`?sources=${listA.id}`);
    expect(decodeURIComponent(String(graphCalls('GET')[0]?.[0]))).toContain("$filter=status ne 'completed'");

    await load(`?sources=${listA.id}&completed=1`);
    const second = String(graphCalls('GET')[1]?.[0]);
    expect(second).not.toContain('$filter');
  });

  it('refreshes the access token once for all lists of an account', async () => {
    await load(both());
    expect(refreshCalls()).toHaveLength(1);
    expect(graphCalls('GET')).toHaveLength(2);
  });

  it('serves from the cache for a minute, then asks Graph again', async () => {
    await load(both());
    advanceSeconds(59);
    await load(both());
    expect(graphCalls('GET')).toHaveLength(2);
    advanceSeconds(61);
    await load(both());
    expect(graphCalls('GET')).toHaveLength(4);
  });

  it('never stores readable task content in D1', async () => {
    await load(both());
    const everything = JSON.stringify([
      sqlite.prepare('SELECT * FROM personal_cache').all(),
      sqlite.prepare('SELECT * FROM provider_cache').all(),
      sqlite.prepare('SELECT * FROM accounts').all(),
    ]);
    expect(everything).not.toMatch(/No due date|Due first|Done already|list-a/);
    const keys = (sqlite.prepare('SELECT key FROM personal_cache').all() as { key: string }[]).map(
      (r) => r.key,
    );
    expect(keys.sort()).toEqual([`tasks:v1:${listA.id}:0`, `tasks:v1:${listB.id}:0`].sort());
  });

  it('serves the last tasks as stale while Graph fails, for up to six hours', async () => {
    await load(both());
    graphFails.add('list-a=');
    advanceSeconds(120);
    const stale = await load(both());
    expect(stale.stale).toBe(true);
    expect(stale.updatedAt).toBe(T0.toISOString());
    expect(stale.data.tasks).toHaveLength(4);
    advanceSeconds(6 * 3600 + 1);
    expect((await call('GET', `/data/tasks${both()}`)).status).toBe(503);
  });

  it('fails as a whole when one list has neither Graph nor a cache', async () => {
    graphFails.add('list-b=');
    const res = await call('GET', `/data/tasks${both()}`);
    expect(res.status).toBe(503);
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/anna@|Due first/);
  });

  it('asks for a reconnect at once when the account needs it, even with a cache', async () => {
    await load(both());
    sqlite.prepare("UPDATE accounts SET status = 'reauth_required'").run();
    const res = await call('GET', `/data/tasks${both()}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { accountId, code: 'reauth_required', message: 'Account needs to be reconnected' },
    });
  });

  it('marks the account when Microsoft refuses the refresh token', async () => {
    upstream.mockImplementation(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    expect((await call('GET', `/data/tasks${both()}`)).status).toBe(409);
    expect((await getAccount(env.DB, accountId)).status).toBe('reauth_required');
  });

  it('ignores unknown, disabled and calendar sources without calling Graph', async () => {
    await updateSource(env.DB, listB.id, { enabled: false });
    const { data } = await load(`?sources=${listB.id},src_aaaaaaaaaaaaaaaa`);
    expect(data).toEqual({ sources: [], tasks: [] });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('validates the query', async () => {
    const good = listA.id;
    for (const query of [
      '',
      '?sources=',
      '?sources=nope',
      `?sources=${good}&completed=2`,
      `?sources=${good}&completed=true`,
    ]) {
      const res = await call('GET', `/data/tasks${query}`);
      expect(res.status, query).toBe(400);
      expect(await errorCode(res)).toBe('validation_error');
    }
  });

  it('is open to the device and the admin token, and to nobody else', async () => {
    expect((await call('GET', `/data/tasks${both()}`, { token: ADMIN_TOKEN })).status).toBe(200);
    expect((await call('GET', `/data/tasks${both()}`, { token: DEVICE_TOKEN })).status).toBe(200);
    expect((await call('GET', `/data/tasks${both()}`, { token: null })).status).toBe(401);
  });
});

describe('PATCH /api/v1/tasks/:sourceId/:taskId', () => {
  const patch = (sourceId: string, taskId: string, body: unknown, token: string | null = DEVICE_TOKEN) =>
    call('PATCH', `/tasks/${sourceId}/${taskId}`, { token, body });

  it('completes a task for the device and sends only the status', async () => {
    const res = await patch(listA.id, 'a1', { completed: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 'a1',
      sourceId: listA.id,
      title: 'No due date',
      completed: true,
    });

    const [[url, init]] = graphCalls('PATCH') as [[string, RequestInit]];
    expect(url).toBe(`${GRAPH}list-a%3D/tasks/a1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ status: 'completed' });
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-1');
  });

  it('reopens a task', async () => {
    const res = await patch(listA.id, 'a3', { completed: false });
    expect(await res.json()).toMatchObject({ id: 'a3', completed: false });
    expect(JSON.parse(String(graphCalls('PATCH')[0]?.[1]?.body))).toEqual({ status: 'notStarted' });
  });

  it('is open to the admin token, and to nobody without one', async () => {
    expect((await patch(listA.id, 'a1', { completed: true }, ADMIN_TOKEN)).status).toBe(200);
    expect((await patch(listA.id, 'a1', { completed: true }, null)).status).toBe(401);
  });

  it('drops the cached lists of that source only, so the next read sees the change', async () => {
    await load(both());
    await patch(listA.id, 'a1', { completed: true });
    expect(sqlite.prepare('SELECT key FROM personal_cache').all()).toEqual([
      { key: `tasks:v1:${listB.id}:0` },
    ]);

    await load(both());
    expect(graphCalls('GET')).toHaveLength(3);
  });

  it('accepts nothing but a boolean completed', async () => {
    for (const body of [
      {},
      { completed: 'yes' },
      { completed: 1 },
      { completed: true, title: 'x' },
      { title: 'x' },
      [],
    ]) {
      const res = await patch(listA.id, 'a1', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await call('PATCH', `/tasks/${listA.id}/a1`, { raw: '{oops' })).status).toBe(400);
    expect(
      (
        await call('PATCH', `/tasks/${listA.id}/a1`, {
          raw: JSON.stringify({ completed: true, pad: 'x'.repeat(2000) }),
        })
      ).status,
    ).toBe(413);
    expect(graphCalls('PATCH')).toHaveLength(0);
  });

  it('answers 404 for malformed ids and for sources that are not enabled task lists', async () => {
    const calendar = await upsertSource(env.DB, {
      accountId,
      kind: 'calendar',
      remoteId: 'cal',
      label: 'Cal',
      color: null,
    });
    await updateSource(env.DB, listB.id, { enabled: false });
    for (const [sourceId, taskId] of [
      ['nope', 'a1'],
      [listA.id, 'a/1'],
      [listA.id, 'a 1'],
      [listA.id, 'x'.repeat(201)],
      ['src_aaaaaaaaaaaaaaaa', 'a1'],
      [calendar.id, 'a1'],
      [listB.id, 'b1'],
    ] as const) {
      const res = await patch(sourceId, taskId, { completed: true });
      expect(res.status, `${sourceId} ${taskId}`).toBe(404);
    }
    expect(graphCalls('PATCH')).toHaveLength(0);
  });

  it('answers 404 when Microsoft does not know the task', async () => {
    patchStatus = 404;
    const res = await patch(listA.id, 'gone', { completed: true });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('not_found');
  });

  it('reports an unavailable provider without details and keeps the cache', async () => {
    await load(both());
    patchStatus = 500;
    const res = await patch(listA.id, 'a1', { completed: true });
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('provider_unavailable');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM personal_cache').get()).toEqual({ n: 2 });
  });

  it('asks for a reconnect when the account needs it', async () => {
    sqlite.prepare("UPDATE accounts SET status = 'reauth_required'").run();
    const res = await patch(listA.id, 'a1', { completed: true });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'reauth_required', accountId } });
  });

  it('does not change other fields of a task: the response is the mapped task', async () => {
    const res = await patch(listB.id, 'b1', { completed: true });
    const body = (await res.json()) as TaskItem;
    expect(Object.keys(body).sort()).toEqual([
      'completed',
      'createdAt',
      'due',
      'id',
      'importance',
      'sourceId',
      'title',
    ]);
  });
});
