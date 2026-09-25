import type { CalendarData, DataEnvelope } from '@dashboard/shared';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { getAccount, updateSource, upsertAccount, upsertSource, type Source } from '../accounts/repository';
import { createSecretBox, toBase64 } from '../crypto/secret-box';
import type { Env } from '../env';
import worker from '../index';
import { createTestD1, migrate } from '../test/d1';
import { ADMIN_TOKEN, DEVICE_TOKEN, seedTokens } from '../test/tokens';

// Fictional origin, credentials, calendars and events used only in tests.
const ORIGIN = 'https://dashboard.example.com';
const ENC_KEY = toBase64(new Uint8Array(32).fill(6));
// 11:00 in Europe/Bratislava (UTC+1 in January).
const T0 = new Date('2026-01-15T10:00:00.000Z');

const timed = (id: string, summary: string, from: string, to: string) => ({
  id,
  summary,
  start: { dateTime: from },
  end: { dateTime: to },
});
const allDay = (id: string, summary: string, from: string, to: string) => ({
  id,
  summary,
  start: { date: from },
  end: { date: to },
});

const EVENTS: Record<string, unknown[]> = {
  'cal-a': [
    timed('a1', 'Breakfast', '2026-01-15T08:00:00Z', '2026-01-15T09:00:00Z'),
    timed('a2', 'Lunch', '2026-01-15T12:00:00Z', '2026-01-15T13:00:00Z'),
    allDay('a3', 'Holiday', '2026-01-15', '2026-01-16'),
  ],
  'cal-b': [
    timed('b1', 'Call', '2026-01-15T11:00:00Z', '2026-01-15T11:30:00Z'),
    allDay('b2', 'Ended', '2026-01-14', '2026-01-15'),
    timed('b3', 'Tomorrow', '2026-01-16T09:00:00Z', '2026-01-16T10:00:00Z'),
  ],
};

let sqlite: DatabaseSync;
let env: Env;
let accountId: string;
let sourceA: Source;
let sourceB: Source;
let failEvents: Set<string>;
const upstream = vi.fn<typeof fetch>();
const errorLog = vi.spyOn(console, 'error');

function calls(prefix: string): URL[] {
  return upstream.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((u) => u.href.startsWith(prefix));
}
const eventCalls = () => calls('https://www.googleapis.com/calendar/v3/calendars/');
const tokenCalls = () => calls('https://oauth2.googleapis.com/token');

async function get(query: string, token: string | null = DEVICE_TOKEN) {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  return worker.fetch(new Request(`${ORIGIN}/api/v1/data/calendar${query}`, { headers }), env);
}

async function load(query: string) {
  const res = await get(query);
  expect(res.status).toBe(200);
  return (await res.json()) as DataEnvelope<CalendarData>;
}

const both = () => `?sources=${sourceA.id},${sourceB.id}`;

function advanceSeconds(n: number): void {
  vi.setSystemTime(new Date(T0.getTime() + n * 1000));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
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
        displayName: null,
        refreshToken: 'refresh-1',
        scopes: 'x',
      },
      T0,
    )
  ).id;
  sourceA = await upsertSource(env.DB, {
    accountId,
    kind: 'calendar',
    remoteId: 'cal-a',
    label: 'Family',
    color: '#4f9dff',
  });
  sourceB = await upsertSource(env.DB, {
    accountId,
    kind: 'calendar',
    remoteId: 'cal-b',
    label: 'Work',
    color: '#ff8a4f',
  });

  failEvents = new Set();
  upstream.mockReset();
  upstream.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.origin + url.pathname === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'access-1', expires_in: 3600 });
    }
    const remoteId = decodeURIComponent(url.pathname.split('/')[4] ?? '');
    if (failEvents.has(remoteId)) return new Response('backend error', { status: 500 });
    return Response.json({ items: EVENTS[remoteId] ?? [] });
  });
  vi.stubGlobal('fetch', upstream);
  errorLog.mockReset().mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GET /api/v1/data/calendar', () => {
  it('merges the calendars in time order, all-day events first, and lists the sources', async () => {
    const { data, ttl, stale, updatedAt } = await load(both());
    expect(data.events.map((e) => e.id)).toEqual(['b2', 'a3', 'a1', 'b1', 'a2', 'b3']);
    expect(data.events.find((e) => e.id === 'a3')).toEqual({
      id: 'a3',
      sourceId: sourceA.id,
      title: 'Holiday',
      start: '2026-01-15',
      end: '2026-01-16',
      allDay: true,
      status: 'confirmed',
    });
    expect(data.events.find((e) => e.id === 'b1')?.sourceId).toBe(sourceB.id);
    expect(data.sources).toEqual([
      { id: sourceA.id, label: 'Family', color: '#4f9dff' },
      { id: sourceB.id, label: 'Work', color: '#ff8a4f' },
    ]);
    expect(ttl).toBe(180);
    expect(stale).toBeUndefined();
    expect(updatedAt).toBe(T0.toISOString());
  });

  it('shows an event that is in several calendars once, with the colour of the first calendar listed', async () => {
    const original = EVENTS['cal-b'];
    onTestFinished(() => {
      EVENTS['cal-b'] = original ?? [];
    });
    EVENTS['cal-b'] = [
      ...(original ?? []),
      timed('dup', 'Lunch', '2026-01-15T12:00:00Z', '2026-01-15T13:00:00Z'),
      timed('near', 'Lunch', '2026-01-15T12:00:00Z', '2026-01-15T13:30:00Z'),
      allDay('dup-day', 'Holiday', '2026-01-15', '2026-01-16'),
    ];
    const ids = (query: string) =>
      load(query).then(({ data }) => data.events.filter((e) => e.title === 'Lunch'));

    const family = await ids(both());
    expect(family.map((e) => [e.id, e.sourceId])).toEqual([
      ['a2', sourceA.id],
      ['near', sourceB.id],
    ]);
    const work = await ids(`?sources=${sourceB.id},${sourceA.id}`);
    expect(work.map((e) => [e.id, e.sourceId])).toEqual([
      ['dup', sourceB.id],
      ['near', sourceB.id],
    ]);
    const holidays = (await load(both())).data.events.filter((e) => e.title === 'Holiday');
    expect(holidays).toHaveLength(1);
    // Alone, a calendar keeps all of its events.
    expect((await ids(`?sources=${sourceB.id}`)).map((e) => e.id)).toEqual(['dup', 'near']);
  });

  it('keeps the requested order of the sources', async () => {
    const { data } = await load(`?sources=${sourceB.id},${sourceA.id}`);
    expect(data.sources.map((s) => s.label)).toEqual(['Work', 'Family']);
  });

  it('asks Google for whole local days from the start of today', async () => {
    await load(`?sources=${sourceA.id}&days=2`);
    const [url] = eventCalls();
    expect(url?.pathname).toBe('/calendar/v3/calendars/cal-a/events');
    expect(url?.searchParams.get('timeMin')).toBe('2026-01-14T23:00:00.000Z');
    expect(url?.searchParams.get('timeMax')).toBe('2026-01-16T23:00:00.000Z');
  });

  it('refreshes the access token once for all calendars of an account', async () => {
    await load(both());
    expect(tokenCalls()).toHaveLength(1);
    expect(eventCalls()).toHaveLength(2);
  });

  it('serves from the cache for three minutes, then asks Google again', async () => {
    await load(both());
    advanceSeconds(179);
    await load(both());
    expect(eventCalls()).toHaveLength(2);

    advanceSeconds(181);
    await load(both());
    expect(eventCalls()).toHaveLength(4);
  });

  it('caches per calendar and range, so another tile can reuse a calendar', async () => {
    await load(`?sources=${sourceA.id}`);
    await load(both());
    expect(eventCalls().map((u) => u.pathname.split('/')[4])).toEqual(['cal-a', 'cal-b']);
    await load(`?sources=${sourceA.id}&days=30`);
    expect(eventCalls()).toHaveLength(3);
  });

  it('never stores readable event content in D1', async () => {
    await load(both());
    const stored = sqlite.prepare('SELECT key, payload_enc FROM personal_cache').all() as {
      key: string;
      payload_enc: string;
    }[];
    expect(stored).toHaveLength(2);
    expect(stored[0]?.key).toMatch(/^calendar:v1:src_[a-z2-7]{16}:2026-01-15:3$/);
    const everything = JSON.stringify([
      stored,
      sqlite.prepare('SELECT * FROM provider_cache').all(),
      sqlite.prepare('SELECT * FROM accounts').all(),
    ]);
    expect(everything).not.toMatch(/Breakfast|Lunch|Holiday|Call|Tomorrow|Family|cal-a/);
  });

  it('serves the last events with stale while Google fails, for up to six hours', async () => {
    await load(both());
    failEvents.add('cal-a');

    advanceSeconds(300);
    const stale = await load(both());
    expect(stale.stale).toBe(true);
    expect(stale.updatedAt).toBe(T0.toISOString());
    expect(stale.data.events).toHaveLength(6);

    advanceSeconds(6 * 3600 + 1);
    expect((await get(both())).status).toBe(503);
  });

  it('fails as a whole when one calendar has neither Google nor a cache', async () => {
    failEvents.add('cal-b');
    const res = await get(both());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('provider_unavailable');
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/Breakfast|backend error/);
  });

  it('asks for a reconnect at once when the account needs it, even with a cache', async () => {
    await load(both());
    sqlite.prepare("UPDATE accounts SET status = 'reauth_required'").run();
    const res = await get(both());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { accountId, code: 'reauth_required', message: 'Account needs to be reconnected' },
    });
  });

  it('marks the account when the refresh token turns out to be revoked', async () => {
    sqlite.prepare('UPDATE accounts SET access_token_enc = NULL, access_expires_at = NULL').run();
    upstream.mockImplementation(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const res = await get(both());
    expect(res.status).toBe(409);
    expect((await getAccount(env.DB, accountId)).status).toBe('reauth_required');
    expect(await (await get(both())).json()).toMatchObject({ error: { code: 'reauth_required', accountId } });
  });

  it('ignores unknown and disabled sources and needs no Google call for them', async () => {
    await updateSource(env.DB, sourceB.id, { enabled: false });
    const { data } = await load(`?sources=${sourceB.id},src_aaaaaaaaaaaaaaaa`);
    expect(data).toEqual({ sources: [], events: [] });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns only the next events that have not started yet when a limit is given', async () => {
    const { data } = await load(`${both()}&days=365&limit=2`);
    // b2 began yesterday and a1 at 08:00Z; the all-day event of today counts as not started.
    expect(data.events.map((e) => e.id)).toEqual(['a3', 'b1']);
    expect((await load(`${both()}&limit=250`)).data.events.map((e) => e.id)).toEqual([
      'a3',
      'b1',
      'a2',
      'b3',
    ]);
    expect(eventCalls().map((u) => u.searchParams.get('timeMax'))[0]).toBe('2027-01-14T23:00:00.000Z');
  });

  it('leaves out events in progress when a limit is given', async () => {
    const original = EVENTS['cal-a'];
    onTestFinished(() => {
      EVENTS['cal-a'] = original ?? [];
    });
    EVENTS['cal-a'] = [
      timed('run', 'Running', '2026-01-15T09:30:00Z', '2026-01-15T10:30:00Z'),
      allDay('long', 'Long trip', '2026-01-14', '2026-01-20'),
      timed('soon', 'Soon', '2026-01-15T10:30:00Z', '2026-01-15T11:00:00Z'),
    ];
    const { data } = await load(`?sources=${sourceA.id}&limit=5`);
    expect(data.events.map((e) => e.id)).toEqual(['soon']);
    expect((await load(`?sources=${sourceA.id}`)).data.events.map((e) => e.id)).toContain('run');
  });

  it('reports a missing encryption key instead of hiding it behind old data', async () => {
    env = { ...env, TOKEN_ENC_KEY: undefined as unknown as string };
    const res = await get(both());
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_configured');
  });

  it('validates the query', async () => {
    const good = sourceA.id;
    for (const query of [
      '',
      '?sources=',
      '?sources=nope',
      `?sources=${good},nope`,
      `?sources=${Array.from({ length: 21 }, (_, i) => `src_${'a'.repeat(15)}${'abcdefghijklmnopqrstu'[i]}`).join(',')}`,
      `?sources=${good}&days=0`,
      `?sources=${good}&days=366`,
      `?sources=${good}&days=x`,
      `?sources=${good}&days=1.5`,
      `?sources=${good}&limit=0`,
      `?sources=${good}&limit=251`,
    ]) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('validation_error');
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('is open to the device and the admin token, and to nobody else', async () => {
    expect((await get(both(), ADMIN_TOKEN)).status).toBe(200);
    expect((await get(both(), DEVICE_TOKEN)).status).toBe(200);
    expect((await get(both(), null)).status).toBe(401);
  });
});
