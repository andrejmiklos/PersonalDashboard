// Device token handling (docs/01-architecture.md §3.1, docs/06-security-and-public-repo.md §6).

const STORAGE_KEY = 'dashboard.deviceToken';
/** Only device tokens: an admin token must never be stored on the wall tablet. */
const DEVICE_TOKEN = /^dsh_device_[A-Za-z0-9_-]{43}$/;

export function isDeviceToken(value: string): boolean {
  return DEVICE_TOKEN.test(value);
}

/** Value of `t` in a `#t=…` fragment, or null. */
export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get('t');
}

export type PairingResult = 'paired' | 'stored' | 'rejected' | 'none';

/**
 * Moves a token from the URL fragment into storage. The fragment is removed from the address bar
 * and history first, whatever it contains. Returns what happened, for the boot screen.
 */
export function pairFromLocation(
  location: Location,
  history: History,
  storage: Storage | null,
): PairingResult {
  const fromHash = location.hash ? tokenFromHash(location.hash) : null;
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (fromHash !== null) {
    if (!isDeviceToken(fromHash)) return 'rejected';
    try {
      storage?.setItem(STORAGE_KEY, fromHash);
    } catch {
      // Storage may be unavailable; the token still works for this session.
    }
    sessionToken = fromHash;
    return 'paired';
  }
  return readStoredToken(storage) === null ? 'none' : 'stored';
}

let sessionToken: string | null = null;

function readStoredToken(storage: Storage | null): string | null {
  try {
    const stored = storage?.getItem(STORAGE_KEY) ?? null;
    return stored !== null && isDeviceToken(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function currentToken(storage: Storage | null): string | null {
  return sessionToken ?? readStoredToken(storage);
}
