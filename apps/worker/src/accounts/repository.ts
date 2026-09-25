import { ApiError } from '../errors';
import { generateId } from '../ids';
import type { SecretBox } from '../crypto/secret-box';
import { refreshTokenContext } from './credentials';

export const ACCOUNT_PROVIDERS = ['google', 'microsoft'] as const;
export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[number];
export type AccountStatus = 'ok' | 'reauth_required';
export type SourceKind = 'calendar' | 'task_list';

/** An account as the admin sees it; never contains tokens. */
export interface Account {
  id: string;
  provider: AccountProvider;
  externalId: string;
  displayName: string | null;
  scopes: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

/** A calendar or a task list of an account. */
export interface Source {
  id: string;
  accountId: string;
  kind: SourceKind;
  remoteId: string;
  label: string;
  color: string | null;
  enabled: boolean;
}

interface AccountRow {
  id: string;
  provider: AccountProvider;
  external_id: string;
  display_name: string | null;
  scopes: string;
  status: AccountStatus;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  account_id: string;
  kind: SourceKind;
  remote_id: string;
  label: string;
  color: string | null;
  enabled: number;
}

const ACCOUNT_COLUMNS = 'id, provider, external_id, display_name, scopes, status, created_at, updated_at';
const SOURCE_COLUMNS = 'id, account_id, kind, remote_id, label, color, enabled';

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    displayName: row.display_name,
    scopes: row.scopes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    remoteId: row.remote_id,
    label: row.label,
    color: row.color,
    enabled: row.enabled === 1,
  };
}

export async function listAccounts(db: D1Database): Promise<Account[]> {
  const { results } = await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY created_at, id`)
    .all<AccountRow>();
  return results.map(toAccount);
}

export async function getAccount(db: D1Database, id: string): Promise<Account> {
  const row = await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`)
    .bind(id)
    .first<AccountRow>();
  if (!row) throw new ApiError(404, 'not_found', 'Account not found');
  return toAccount(row);
}

export interface AccountInput {
  provider: AccountProvider;
  externalId: string;
  displayName: string | null;
  refreshToken: string;
  scopes: string;
}

/**
 * Creates the account of a completed OAuth flow, or renews an existing one (same provider and subject):
 * the new refresh token replaces the old, the status returns to `ok` and cached credentials are dropped.
 */
export async function upsertAccount(
  db: D1Database,
  box: SecretBox,
  input: AccountInput,
  now: Date,
): Promise<Account> {
  const existing = await db
    .prepare('SELECT id FROM accounts WHERE provider = ? AND external_id = ?')
    .bind(input.provider, input.externalId)
    .first<{ id: string }>();
  const id = existing?.id ?? generateId('acc');
  const sealed = await box.seal(input.refreshToken, refreshTokenContext(id));
  const timestamp = now.toISOString();

  if (existing) {
    await db
      .prepare(
        `UPDATE accounts SET display_name = ?, refresh_token_enc = ?, scopes = ?, status = 'ok',
           access_token_enc = NULL, access_expires_at = NULL, refresh_lock_until = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .bind(input.displayName, sealed, input.scopes, timestamp, id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO accounts (id, provider, external_id, display_name, refresh_token_enc, scopes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.provider,
        input.externalId,
        input.displayName,
        sealed,
        input.scopes,
        timestamp,
        timestamp,
      )
      .run();
  }
  return getAccount(db, id);
}

/**
 * Deletes an account; its sources go with it (foreign key cascade). The personal cache is emptied too,
 * so no event or task content of the account stays behind; it refills from the other accounts.
 */
export async function deleteAccount(db: D1Database, id: string): Promise<void> {
  const [deleted] = await db.batch([
    db.prepare('DELETE FROM accounts WHERE id = ? RETURNING id').bind(id),
    db.prepare('DELETE FROM personal_cache'),
  ]);
  if (!deleted?.results.length) throw new ApiError(404, 'not_found', 'Account not found');
}

export interface SourceFilter {
  kind?: SourceKind;
  accountId?: string;
  /** Only these source ids; an empty list matches nothing. */
  ids?: string[];
  enabledOnly?: boolean;
}

export async function listSources(db: D1Database, filter: SourceFilter = {}): Promise<Source[]> {
  if (filter.ids?.length === 0) return [];
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filter.kind) {
    conditions.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.accountId) {
    conditions.push('account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.ids) {
    conditions.push(`id IN (${filter.ids.map(() => '?').join(', ')})`);
    params.push(...filter.ids);
  }
  if (filter.enabledOnly) {
    conditions.push('enabled = 1');
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { results } = await db
    .prepare(`SELECT ${SOURCE_COLUMNS} FROM sources${where} ORDER BY label COLLATE NOCASE, id`)
    .bind(...params)
    .all<SourceRow>();
  return results.map(toSource);
}

export async function getSource(db: D1Database, id: string): Promise<Source> {
  const row = await db
    .prepare(`SELECT ${SOURCE_COLUMNS} FROM sources WHERE id = ?`)
    .bind(id)
    .first<SourceRow>();
  if (!row) throw new ApiError(404, 'not_found', 'Source not found');
  return toSource(row);
}

export interface SourceInput {
  accountId: string;
  kind: SourceKind;
  remoteId: string;
  label: string;
  color: string | null;
}

/** Adds a source, or updates label and colour of the same remote calendar / list that is already known. */
export async function upsertSource(db: D1Database, input: SourceInput): Promise<Source> {
  const row = await db
    .prepare(
      `INSERT INTO sources (id, account_id, kind, remote_id, label, color) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, kind, remote_id) DO UPDATE SET label = excluded.label, color = excluded.color
       RETURNING ${SOURCE_COLUMNS}`,
    )
    .bind(generateId('src'), input.accountId, input.kind, input.remoteId, input.label, input.color)
    .first<SourceRow>();
  return toSource(row as SourceRow);
}

export interface SourcePatch {
  label?: string | undefined;
  color?: string | null | undefined;
  enabled?: boolean | undefined;
}

export async function updateSource(db: D1Database, id: string, patch: SourcePatch): Promise<Source> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.label !== undefined) {
    sets.push('label = ?');
    params.push(patch.label);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    params.push(patch.color);
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(patch.enabled ? 1 : 0);
  }
  if (sets.length === 0) return getSource(db, id);
  const row = await db
    .prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ? RETURNING ${SOURCE_COLUMNS}`)
    .bind(...params, id)
    .first<SourceRow>();
  if (!row) throw new ApiError(404, 'not_found', 'Source not found');
  return toSource(row);
}
