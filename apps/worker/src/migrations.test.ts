import type { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from './test/d1';

const NOW = '2026-01-15T08:00:00.000Z';

describe('migrations', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = migrate();
  });

  it('creates all tables', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      'accounts',
      'api_tokens',
      'device_status',
      'layouts',
      'oauth_states',
      'overrides',
      'pairing_codes',
      'personal_cache',
      'provider_cache',
      'schedule_rules',
      'settings',
      'sources',
    ]);
  });

  it('rejects an unknown token role and a duplicate token hash', () => {
    const insert = db.prepare(
      'INSERT INTO api_tokens (id, role, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    insert.run('t1', 'admin', 'test', 'hash-1', NOW);
    expect(() => insert.run('t2', 'root', 'test', 'hash-2', NOW)).toThrow(/CHECK/);
    expect(() => insert.run('t3', 'device', 'test', 'hash-1', NOW)).toThrow(/UNIQUE/);
  });

  it('deletes sources together with their account', () => {
    db.prepare(
      `INSERT INTO accounts (id, provider, external_id, refresh_token_enc, scopes, created_at, updated_at)
       VALUES ('a1', 'google', 'ext-1', 'enc', 'scope', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      "INSERT INTO sources (id, account_id, kind, remote_id, label) VALUES ('s1', 'a1', 'calendar', 'cal-1', 'Test')",
    ).run();

    db.prepare("DELETE FROM accounts WHERE id = 'a1'").run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sources').get()).toEqual({ n: 0 });
  });

  it('rejects a source of a missing account', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO sources (id, account_id, kind, remote_id, label) VALUES ('s1', 'missing', 'calendar', 'cal-1', 'Test')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('allows a single override row and clears its layout on delete', () => {
    db.prepare("INSERT INTO layouts (id, name, json, updated_at) VALUES ('l1', 'Test', '{}', ?)").run(NOW);
    db.prepare("INSERT INTO overrides (id, layout_id, screen) VALUES (1, 'l1', 'on')").run();
    expect(() => db.prepare("INSERT INTO overrides (id, screen) VALUES (2, 'off')").run()).toThrow(/CHECK/);

    db.prepare("DELETE FROM layouts WHERE id = 'l1'").run();
    expect(db.prepare('SELECT layout_id FROM overrides').get()).toEqual({ layout_id: null });
  });
});
