import type { SecretBox } from '../crypto/secret-box';
import type { CacheStore } from './provider-cache';

/**
 * Cache for payloads with personal data (`personal_cache`): every payload is sealed with the secret box,
 * bound to its key. A row that cannot be opened (changed key, damaged) counts as a miss.
 */
export function sealedStore(db: D1Database, box: SecretBox): CacheStore {
  const context = (key: string) => `cache:${key}`;
  return {
    async read(key) {
      const row = await db
        .prepare('SELECT payload_enc, fetched_at FROM personal_cache WHERE key = ?')
        .bind(key)
        .first<{ payload_enc: string; fetched_at: string }>();
      if (!row) return null;
      try {
        return { data: JSON.parse(await box.open(row.payload_enc, context(key))), fetchedAt: row.fetched_at };
      } catch {
        return null;
      }
    },

    async write(key, data, fetchedAt, staleSeconds) {
      const pruneBefore = new Date(fetchedAt.getTime() - staleSeconds * 1000).toISOString();
      const sealed = await box.seal(JSON.stringify(data), context(key));
      await db.batch([
        db
          .prepare(
            `INSERT INTO personal_cache (key, payload_enc, fetched_at) VALUES (?, ?, ?)
             ON CONFLICT (key) DO UPDATE SET payload_enc = excluded.payload_enc, fetched_at = excluded.fetched_at`,
          )
          .bind(key, sealed, fetchedAt.toISOString()),
        db.prepare('DELETE FROM personal_cache WHERE fetched_at < ?').bind(pruneBefore),
      ]);
    },
  };
}
