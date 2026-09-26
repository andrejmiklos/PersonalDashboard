/** An error answer of the API (`{ error: { code, message } }`), or `network` when there was no answer. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

function errorFrom(status: number, body: unknown): ApiError {
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof error?.code === 'string' ? error.code : `http_${status}`;
  const message = typeof error?.message === 'string' ? error.message : `HTTP ${status}`;
  return new ApiError(status, code, message);
}

/** Calls `/api/v1` with the admin token; a rejected token (401) calls `onUnauthorized`, e.g. to sign out. */
export function createApi(token: string, onUnauthorized: () => void, fetchFn: typeof fetch = fetch): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        cache: 'no-store',
        credentials: 'omit',
      });
    } catch {
      throw new ApiError(0, 'network', 'The server is not reachable');
    }
    if (res.status === 204) return undefined as T;
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Not JSON (e.g. a proxy error page): reported by status below.
    }
    if (res.ok) return parsed as T;
    if (res.status === 401) onUnauthorized();
    throw errorFrom(res.status, parsed);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
  };
}
