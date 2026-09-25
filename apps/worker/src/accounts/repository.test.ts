import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSecretBox, toBase64, type SecretBox } from '../crypto/secret-box';
import { createTestD1, migrate } from '../test/d1';
import {
  loadAccessToken,
  loadRefreshToken,
  markReauthRequired,
  releaseRefreshLock,
  saveAccessToken,
  saveRefreshToken,
  tryAcquireRefreshLock,
} from './credentials';
import {
  deleteAccount,
  getAccount,
  listAccounts,
  listSources,
  updateSource,
  upsertAccount,
  upsertSource,
} from './repository';

// Fictional identities and tokens used only in tests.
const NOW = new Date('2026-01-15T08:00:00.000Z');
const LATER = new Date('2026-01-15T09:00:00.000Z');
const ANNA = {
  provider: 'google',
  externalId: 'google-subject-1',
  displayName: 'anna@example.com',
  refreshToken: 'refresh-token-one',
  scopes: 'calendar.readonly',
} as const;

let sqlite: DatabaseSync;
let db: D1Database;
let box: SecretBox;

beforeEach(async () => {
  sqlite = migrate();
  db = createTestD1(sqlite);
  box = await createSecretBox(toBase64(new Uint8Array(32).fill(3)));
});

describe('accounts', () => {
  it('stores the refresh token sealed and never returns it', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    expect(account).toMatchObject({ provider: 'google', externalId: 'google-subject-1', status: 'ok' });
    expect(account.id).toMatch(/^acc_[a-z2-7]{16}$/);
    expect(JSON.stringify(account)).not.toContain('refresh-token-one');

    const stored = sqlite.prepare('SELECT refresh_token_enc FROM accounts').get() as {
      refresh_token_enc: string;
    };
    expect(stored.refresh_token_enc).not.toContain('refresh-token-one');
    expect(await loadRefreshToken(db, box, account.id)).toBe('refresh-token-one');
  });

  it('renews the same subject in place and clears the reconnect state', async () => {
    const first = await upsertAccount(db, box, ANNA, NOW);
    await upsertSource(db, {
      accountId: first.id,
      kind: 'calendar',
      remoteId: 'cal-1',
      label: 'Home',
      color: '#3366cc',
    });
    await saveAccessToken(db, box, first.id, 'access-token', new Date(NOW.getTime() + 3_600_000));
    await markReauthRequired(db, first.id, NOW);
    expect((await getAccount(db, first.id)).status).toBe('reauth_required');

    const second = await upsertAccount(db, box, { ...ANNA, refreshToken: 'refresh-token-two' }, LATER);
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      status: 'ok',
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(await loadRefreshToken(db, box, first.id)).toBe('refresh-token-two');
    expect(await loadAccessToken(db, box, first.id, LATER)).toBeNull();
    expect(await listAccounts(db)).toHaveLength(1);
    expect(await listSources(db)).toHaveLength(1);
  });

  it('keeps accounts of different providers or subjects apart', async () => {
    await upsertAccount(db, box, ANNA, NOW);
    await upsertAccount(db, box, { ...ANNA, externalId: 'google-subject-2' }, NOW);
    await upsertAccount(db, box, { ...ANNA, provider: 'microsoft' }, NOW);
    expect(await listAccounts(db)).toHaveLength(3);
  });

  it('deletes an account together with its sources', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    await upsertSource(db, {
      accountId: account.id,
      kind: 'calendar',
      remoteId: 'c',
      label: 'C',
      color: null,
    });
    await deleteAccount(db, account.id);
    expect(await listAccounts(db)).toEqual([]);
    expect(await listSources(db)).toEqual([]);
    await expect(deleteAccount(db, account.id)).rejects.toMatchObject({ status: 404 });
    await expect(getAccount(db, account.id)).rejects.toMatchObject({ status: 404 });
  });

  it('does not open a refresh token that was moved to another account', async () => {
    const a = await upsertAccount(db, box, ANNA, NOW);
    const b = await upsertAccount(db, box, { ...ANNA, externalId: 'google-subject-2' }, NOW);
    sqlite
      .prepare(
        'UPDATE accounts SET refresh_token_enc = (SELECT refresh_token_enc FROM accounts WHERE id = ?) WHERE id = ?',
      )
      .run(a.id, b.id);
    await expect(loadRefreshToken(db, box, b.id)).rejects.toThrow('Cannot open sealed value');
  });
});

describe('credentials', () => {
  it('replaces the refresh token when it rotates', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    await saveRefreshToken(db, box, account.id, 'rotated', LATER);
    expect(await loadRefreshToken(db, box, account.id)).toBe('rotated');
  });

  it('serves the access token until a minute before it expires', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    expect(await loadAccessToken(db, box, account.id, NOW)).toBeNull();

    await saveAccessToken(db, box, account.id, 'access-token', new Date('2026-01-15T09:00:00.000Z'));
    expect(await loadAccessToken(db, box, account.id, new Date('2026-01-15T08:58:59.000Z'))).toBe(
      'access-token',
    );
    expect(await loadAccessToken(db, box, account.id, new Date('2026-01-15T08:59:01.000Z'))).toBeNull();
    const stored = sqlite.prepare('SELECT access_token_enc FROM accounts').get() as {
      access_token_enc: string;
    };
    expect(stored.access_token_enc).not.toContain('access-token');
  });

  it('lets only one request refresh at a time, and frees the lock on release or expiry', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    expect(await tryAcquireRefreshLock(db, account.id, NOW, 10_000)).toBe(true);
    expect(await tryAcquireRefreshLock(db, account.id, new Date(NOW.getTime() + 5_000), 10_000)).toBe(false);
    expect(await tryAcquireRefreshLock(db, account.id, new Date(NOW.getTime() + 10_000), 10_000)).toBe(true);

    await releaseRefreshLock(db, account.id);
    expect(await tryAcquireRefreshLock(db, account.id, NOW, 10_000)).toBe(true);
  });

  it('reports an unknown account', async () => {
    await expect(loadRefreshToken(db, box, 'acc_unknown')).rejects.toMatchObject({ status: 404 });
  });
});

describe('sources', () => {
  it('adds a source once and updates label and colour on repeat', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    const input = {
      accountId: account.id,
      kind: 'calendar',
      remoteId: 'cal-1',
      label: 'Home',
      color: null,
    } as const;
    const first = await upsertSource(db, input);
    expect(first).toMatchObject({ label: 'Home', color: null, enabled: true });
    expect(first.id).toMatch(/^src_[a-z2-7]{16}$/);

    const second = await upsertSource(db, { ...input, label: 'Home renamed', color: '#3366cc' });
    expect(second).toMatchObject({ id: first.id, label: 'Home renamed', color: '#3366cc' });
    expect(await listSources(db)).toHaveLength(1);
  });

  it('filters by kind, ids and enabled state', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    const home = await upsertSource(db, {
      accountId: account.id,
      kind: 'calendar',
      remoteId: 'a',
      label: 'Home',
      color: null,
    });
    const work = await upsertSource(db, {
      accountId: account.id,
      kind: 'calendar',
      remoteId: 'b',
      label: 'Work',
      color: null,
    });
    const list = await upsertSource(db, {
      accountId: account.id,
      kind: 'task_list',
      remoteId: 'c',
      label: 'Shopping',
      color: null,
    });
    await updateSource(db, work.id, { enabled: false });

    expect((await listSources(db, { kind: 'calendar' })).map((s) => s.id)).toEqual([home.id, work.id]);
    expect((await listSources(db, { kind: 'calendar', enabledOnly: true })).map((s) => s.id)).toEqual([
      home.id,
    ]);
    expect((await listSources(db, { ids: [list.id, work.id] })).map((s) => s.id)).toEqual([list.id, work.id]);
    expect(await listSources(db, { ids: [] })).toEqual([]);
    expect(await listSources(db, { accountId: 'acc_other' })).toEqual([]);
  });

  it('patches only the given fields', async () => {
    const account = await upsertAccount(db, box, ANNA, NOW);
    const source = await upsertSource(db, {
      accountId: account.id,
      kind: 'calendar',
      remoteId: 'a',
      label: 'Home',
      color: '#112233',
    });

    expect(await updateSource(db, source.id, { label: 'Family' })).toMatchObject({
      label: 'Family',
      color: '#112233',
    });
    expect(await updateSource(db, source.id, { color: null, enabled: false })).toMatchObject({
      label: 'Family',
      color: null,
      enabled: false,
    });
    expect(await updateSource(db, source.id, {})).toMatchObject({ label: 'Family' });
    await expect(updateSource(db, 'src_unknown', { label: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});
