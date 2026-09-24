// Last display state and tile payloads in localStorage, so a reload or an outage still shows the
// dashboard (docs/01-architecture.md §5). Storage may be missing or full: every access is guarded.

const PREFIX = 'dashboard.cache.';

export function readCache<T>(storage: Storage | null, key: string): T | null {
  try {
    const raw = storage?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or disabled storage: the dashboard still works, only without the offline copy.
  }
}

/** Drops every cached entry, e.g. when the server rejects the device token. */
export function clearCache(storage: Storage | null): void {
  try {
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Nothing more to do without storage.
  }
}
