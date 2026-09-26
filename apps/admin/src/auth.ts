import { readItem, writeItem } from './storage';

const TOKEN_KEY = 'admin.token';

export function readToken(storage: Storage | null): string | null {
  return readItem(storage, TOKEN_KEY);
}

export function storeToken(storage: Storage | null, token: string | null): void {
  writeItem(storage, TOKEN_KEY, token);
}

export type LoginResult = 'ok' | 'invalid' | 'failed';

/** The token is only valid when the server lets it read the layouts, which needs the admin role. */
export async function checkToken(token: string, fetchFn: typeof fetch = fetch): Promise<LoginResult> {
  try {
    const res = await fetchFn('/api/v1/layouts', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
    });
    if (res.ok) return 'ok';
    return res.status === 401 || res.status === 403 ? 'invalid' : 'failed';
  } catch {
    return 'failed';
  }
}
