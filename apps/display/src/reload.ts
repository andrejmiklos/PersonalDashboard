import { DEV_APP_VERSION } from '@dashboard/shared';

const STORAGE_KEY = 'dashboard.reloadedFor';
/** At most one reload per server version in this window, so a stale cache cannot cause a reload loop. */
const RELOAD_GUARD_MS = 10 * 60_000;

interface ReloadMark {
  version: string;
  at: number;
}

function readMark(storage: Storage | null): ReloadMark | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReloadMark) : null;
  } catch {
    return null;
  }
}

/** True when the server runs another build than this bundle and we have not just reloaded for it. */
export function shouldReload(
  serverVersion: string,
  bundleVersion: string,
  now: number,
  storage: Storage | null,
): boolean {
  if (
    serverVersion === bundleVersion ||
    serverVersion === DEV_APP_VERSION ||
    bundleVersion === DEV_APP_VERSION
  ) {
    return false;
  }
  const mark = readMark(storage);
  if (mark && mark.version === serverVersion && now - mark.at < RELOAD_GUARD_MS) {
    return false;
  }
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ version: serverVersion, at: now }));
  } catch {
    // Without storage the guard cannot persist; reloading is still better than running stale code.
  }
  return true;
}
