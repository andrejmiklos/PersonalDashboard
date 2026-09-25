import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecretBox, toBase64 } from '../crypto/secret-box';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { calendarListFixture } from '../test/google-calendar';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';
import { listSources, upsertAccount } from './repository';
import { SOURCE_COLORS } from './routes';

// Fictional origin, credentials and identities used only in tests.
const ORIGIN = 'https://dashboard.example.com';
const ENC_KEY = toBase64(new Uint8Array(32).fill(4));
const FAMILY = 'family-1@group.calendar.example.com';

let sqlite: DatabaseSync;
let env: Env;
let accountId: string;
const upstream = vi.fn<typeof fetch>();
const errorLog = vi.spyOn(console, 'error');

async function call(method: string, path: string, init: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${init.token ?? ADMIN_TOKEN}` };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(
    new Request(`${ORIGIN}/api/v1${path}`, {
      method,
      headers,
      body: init.body === undefined ? null : JSON.stringify(init.body),
    }),
    env,
  );
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeEach(async () => {
  sqlite = migrate();
  env = {
    DB: createTestD1(sqlite),
    TOKEN_ENC_KEY: ENC_KEY,
    GOOGLE_CLIENT_ID: 'id-1',
    GOOGLE_CLIENT_SECRET: 'secret-1',
  } as Env;
  await seedTokens(sqlite);
  const box = await createSecretBox(ENC_KEY);
  accountId = (
    await upsertAccount(
      env.DB,
      box,
      {
        provider: 'google',
        externalId: 'subject-1',
        displayName: 'anna@example.com',
        refreshToken: 'refresh-1',
        scopes: 'calendar',
      },
      new Date('2026-01-15T08:00:00.000Z'),
    )
  ).id;

  upstream.mockReset();
  upstream.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Response.json({ access_token: 'access-1', expires_in: 3600 });
    }
    return Response.json(calendarListFixture());
  });
  vi.stubGlobal('fetch', upstream);
  errorLog.mockReset().mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('access', () => {
  it('is admin only', async () => {
    for (const [method, path] of [
      ['GET', '/accounts'],
      ['DELETE', `/accounts/${accountId}`],
      ['GET', `/accounts/${accountId}/discover`],
      ['POST', `/accounts/${accountId}/sources`],
      ['GET', '/sources'],
      ['PUT', '/sources/src_aaaaaaaaaaaaaaaa'],
    ] as const) {
      const res = await call(method, path, { token: DEVICE_TOKEN });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    const anonymous = await worker.fetch(new Request(`${ORIGIN}/api/v1/accounts`), env);
    expect(anonymous.status).toBe(401);
  });
});

describe('accounts', () => {
  it('lists accounts without tokens or scopes', async () => {
    const body = await json<unknown[]>(await call('GET', '/accounts'));
    expect(body).toEqual([
      { id: accountId, provider: 'google', displayName: 'anna@example.com', status: 'ok' },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/refresh|scopes|access/);
  });

  it('deletes an account with its sources', async () => {
    await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } });
    expect((await call('DELETE', `/accounts/${accountId}`)).status).toBe(204);
    expect(await json<unknown[]>(await call('GET', '/accounts'))).toEqual([]);
    expect(await listSources(env.DB)).toEqual([]);
    expect((await call('DELETE', `/accounts/${accountId}`)).status).toBe(404);
  });

  it('answers 404 for malformed and unknown ids', async () => {
    expect((await call('DELETE', '/accounts/nope')).status).toBe(404);
    expect((await call('GET', '/accounts/nope/discover')).status).toBe(404);
    expect((await call('GET', '/accounts/acc_aaaaaaaaaaaaaaaa/discover')).status).toBe(404);
  });
});

describe('discover', () => {
  it('lists the remote calendars and marks the ones that were added', async () => {
    await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } });
    const items = await json<{ remoteId: string; label: string; kind: string; sourceId: string | null }[]>(
      await call('GET', `/accounts/${accountId}/discover`),
    );
    expect(items.map((i) => [i.remoteId, i.label, i.kind, i.sourceId !== null])).toEqual([
      ['anna@example.com', 'anna@example.com', 'calendar', false],
      [FAMILY, 'Our family', 'calendar', true],
      ['holidays-1@group.calendar.example.com', 'Holidays', 'calendar', false],
    ]);
  });

  it('asks for a reconnect when the grant is gone', async () => {
    upstream.mockImplementation(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const res = await call('GET', `/accounts/${accountId}/discover`);
    expect(res.status).toBe(409);
    expect(await json(res)).toEqual({
      error: { accountId, code: 'reauth_required', message: 'Account needs to be reconnected' },
    });
    expect((await json<{ status: string }[]>(await call('GET', '/accounts')))[0]?.status).toBe(
      'reauth_required',
    );
  });

  it('reports an unavailable provider without details', async () => {
    upstream.mockImplementation(async (input) =>
      String(input).includes('oauth2')
        ? Response.json({ access_token: 'access-1', expires_in: 3600 })
        : new Response('quota exceeded for anna@example.com', { status: 429 }),
    );
    const res = await call('GET', `/accounts/${accountId}/discover`);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await json(res))).not.toContain('anna@');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('HTTP 429'));
  });
});

describe('sources', () => {
  it('adds a discovered calendar with its remote label and a palette colour', async () => {
    const res = await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } });
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({
      accountId,
      kind: 'calendar',
      remoteId: FAMILY,
      label: 'Our family',
      color: SOURCE_COLORS[0],
      enabled: true,
    });
    const second = await call('POST', `/accounts/${accountId}/sources`, {
      body: { remoteId: 'anna@example.com', label: 'Me', color: '#ABCDEF' },
    });
    expect(await json(second)).toMatchObject({ label: 'Me', color: '#abcdef' });
    const third = await call('POST', `/accounts/${accountId}/sources`, {
      body: { remoteId: 'holidays-1@group.calendar.example.com' },
    });
    expect(await json(third)).toMatchObject({ color: SOURCE_COLORS[2] });
  });

  it('does not add the same calendar twice', async () => {
    await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } });
    await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY, label: 'Renamed' } });
    const sources = await json<{ label: string }[]>(await call('GET', '/sources'));
    expect(sources.map((s) => s.label)).toEqual(['Renamed']);
  });

  it('refuses calendars the account does not have and invalid bodies', async () => {
    expect(
      (await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: 'other@example.com' } }))
        .status,
    ).toBe(404);
    for (const body of [
      {},
      { remoteId: '' },
      { remoteId: FAMILY, color: 'red' },
      { remoteId: FAMILY, extra: 1 },
      { remoteId: FAMILY, label: ' ' },
    ]) {
      expect((await call('POST', `/accounts/${accountId}/sources`, { body })).status).toBe(400);
    }
  });

  it('lists sources, optionally by kind, and validates the kind', async () => {
    await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } });
    expect(await json<unknown[]>(await call('GET', '/sources?kind=calendar'))).toHaveLength(1);
    expect(await json<unknown[]>(await call('GET', '/sources?kind=task_list'))).toHaveLength(0);
    expect((await call('GET', '/sources?kind=other')).status).toBe(400);
  });

  it('changes label, colour and enabled state', async () => {
    const added = await json<{ id: string }>(
      await call('POST', `/accounts/${accountId}/sources`, { body: { remoteId: FAMILY } }),
    );
    const res = await call('PUT', `/sources/${added.id}`, {
      body: { label: 'Home', color: '#112233', enabled: false },
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ id: added.id, label: 'Home', color: '#112233', enabled: false });
    expect((await call('PUT', `/sources/${added.id}`, { body: { color: null } })).status).toBe(200);

    expect((await call('PUT', `/sources/${added.id}`, { body: { remoteId: 'x' } })).status).toBe(400);
    expect((await call('PUT', '/sources/src_aaaaaaaaaaaaaaaa', { body: { label: 'x' } })).status).toBe(404);
    expect((await call('PUT', '/sources/bad', { body: { label: 'x' } })).status).toBe(404);
  });
});
