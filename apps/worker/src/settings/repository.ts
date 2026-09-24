import { DEFAULT_SETTINGS, SETTING_KEYS, settingsSchemas, type Settings, type SettingsPatch } from './schema';

interface SettingRow {
  key: string;
  value: string;
}

/** Stored values over defaults; a stored value that no longer validates falls back to its default. */
export async function readSettings(db: D1Database): Promise<Settings> {
  const placeholders = SETTING_KEYS.map(() => '?').join(', ');
  const { results } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
    .bind(...SETTING_KEYS)
    .all<SettingRow>();

  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of results) {
    const key = row.key as keyof Settings;
    let stored: unknown;
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = undefined;
    }
    const parsed = settingsSchemas[key].safeParse(stored);
    if (parsed.success) {
      settings[key] = parsed.data;
    } else {
      console.error(`invalid stored setting ignored: ${key}`);
    }
  }
  return settings as Settings;
}

/** Upserts the given keys in one D1 batch (a single transaction). */
export async function writeSettings(db: D1Database, patch: SettingsPatch): Promise<void> {
  const statements = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      db
        .prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        )
        .bind(key, JSON.stringify(value)),
    );
  await db.batch(statements);
}
