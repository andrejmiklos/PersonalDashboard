/** A source of tile data (docs/05-integrations.md §6). */
export interface Provider<TParams, TData> {
  /** Short name for logs. */
  name: string;
  /** A payload younger than this is served without calling the provider. */
  ttlSeconds: number;
  /** How long an older payload may still be served while the provider fails. */
  staleSeconds: number;
  /** Includes a shape version, so a changed normalised shape never reads old rows. */
  cacheKey(params: TParams): string;
  /** Returns the normalised payload or throws. */
  fetch(params: TParams): Promise<TData>;
}

/** The provider answered with an error or with data we cannot use. The message is safe to log. */
export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

const TIMEOUT_MS = 8_000;

/** GETs JSON from a provider with a timeout; non-2xx and non-JSON bodies are a ProviderError. */
export async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ProviderError(`HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError('Response is not JSON');
  }
}
