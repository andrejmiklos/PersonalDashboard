import type { LayoutDocument } from '@dashboard/shared';
import { ApiError } from '../errors';
import { generateId } from '../ids';
import type { LayoutBody } from './validate';

interface LayoutRow {
  id: string;
  name: string;
  json: string;
  version: number;
  updated_at: string;
}

export interface LayoutSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  tileCount: number;
}

function toDocument(row: LayoutRow): LayoutDocument {
  const body = JSON.parse(row.json) as LayoutBody;
  return { ...body, id: row.id, name: row.name, version: row.version };
}

function notFound(): ApiError {
  return new ApiError(404, 'not_found', 'Layout not found');
}

export async function listLayouts(db: D1Database): Promise<LayoutSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, version, updated_at AS updatedAt, json_array_length(json, '$.tiles') AS tileCount
       FROM layouts ORDER BY name COLLATE NOCASE, id`,
    )
    .all<LayoutSummary>();
  return results;
}

export async function getLayout(db: D1Database, id: string): Promise<LayoutDocument> {
  const row = await db
    .prepare('SELECT id, name, json, version, updated_at FROM layouts WHERE id = ?')
    .bind(id)
    .first<LayoutRow>();
  if (!row) throw notFound();
  return toDocument(row);
}

export async function createLayout(db: D1Database, body: LayoutBody, now: Date): Promise<LayoutDocument> {
  const id = generateId('lay');
  await db
    .prepare('INSERT INTO layouts (id, name, json, version, updated_at) VALUES (?, ?, ?, 1, ?)')
    .bind(id, body.name, JSON.stringify(body), now.toISOString())
    .run();
  return getLayout(db, id);
}

/** Replaces a layout and bumps its version; with `ifVersion`, only if the stored version still matches. */
export async function replaceLayout(
  db: D1Database,
  id: string,
  body: LayoutBody,
  now: Date,
  ifVersion?: number,
): Promise<LayoutDocument> {
  const versionClause = ifVersion === undefined ? '' : ' AND version = ?';
  const params = [
    body.name,
    JSON.stringify(body),
    now.toISOString(),
    id,
    ...(ifVersion === undefined ? [] : [ifVersion]),
  ];
  const updated = await db
    .prepare(
      `UPDATE layouts SET name = ?, json = ?, version = version + 1, updated_at = ? WHERE id = ?${versionClause} RETURNING id`,
    )
    .bind(...params)
    .first<{ id: string }>();
  if (!updated) {
    await getLayout(db, id); // 404 when it does not exist at all
    throw new ApiError(409, 'version_conflict', 'Layout was changed since it was loaded');
  }
  return getLayout(db, id);
}

export async function duplicateLayout(db: D1Database, id: string, now: Date): Promise<LayoutDocument> {
  const source = await getLayout(db, id);
  const name = `${source.name} (copy)`.slice(0, 64);
  const body: LayoutBody = {
    schemaVersion: source.schemaVersion,
    name,
    grid: source.grid,
    theme: source.theme,
    tiles: source.tiles,
  };
  return createLayout(db, body, now);
}

/** Deletes a layout unless the default setting, a schedule rule or the override still uses it (the FKs would cascade silently). */
export async function deleteLayout(db: D1Database, id: string): Promise<void> {
  const refs = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM schedule_rules WHERE layout_id = ?1) AS rules,
              (SELECT COUNT(*) FROM overrides WHERE layout_id = ?1) AS overrides,
              (SELECT COUNT(*) FROM settings WHERE key = 'defaultLayoutId' AND value = json_quote(?1)) AS defaults`,
    )
    .bind(id)
    .first<{ rules: number; overrides: number; defaults: number }>();
  if (refs && (refs.rules > 0 || refs.overrides > 0 || refs.defaults > 0)) {
    const uses = [
      refs.defaults > 0 ? 'the default layout setting' : '',
      refs.rules > 0 ? `${refs.rules} schedule rule(s)` : '',
      refs.overrides > 0 ? 'the override' : '',
    ].filter(Boolean);
    throw new ApiError(409, 'layout_in_use', `Layout is used by ${uses.join(', ')}`);
  }
  const deleted = await db.prepare('DELETE FROM layouts WHERE id = ? RETURNING id').bind(id).first();
  if (!deleted) throw notFound();
}
