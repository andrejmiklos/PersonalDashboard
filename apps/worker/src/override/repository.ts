/** The manual override of the admin (docs/04-layouts-and-editor.md §3.2): one layout pinned on the display. */
export interface Override {
  layoutId: string;
  /** ISO instant; null until cleared. */
  expiresAt: string | null;
}

interface OverrideRow {
  layout_id: string | null;
  expires_at: string | null;
}

/** The active override, or null when there is none, it has expired, or its layout is gone. */
export async function readOverride(db: D1Database, now: Date): Promise<Override | null> {
  const row = await db
    .prepare('SELECT layout_id, expires_at FROM overrides WHERE id = 1')
    .first<OverrideRow>();
  if (!row?.layout_id) return null;
  if (row.expires_at !== null && Date.parse(row.expires_at) <= now.getTime()) return null;
  return { layoutId: row.layout_id, expiresAt: row.expires_at };
}

/** Replaces the override (there is at most one). */
export async function writeOverride(db: D1Database, override: Override): Promise<void> {
  await db
    .prepare(
      `INSERT INTO overrides (id, layout_id, screen, expires_at) VALUES (1, ?, NULL, ?)
       ON CONFLICT (id) DO UPDATE SET layout_id = excluded.layout_id, screen = NULL, expires_at = excluded.expires_at`,
    )
    .bind(override.layoutId, override.expiresAt)
    .run();
}

export async function clearOverride(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM overrides WHERE id = 1').run();
}
