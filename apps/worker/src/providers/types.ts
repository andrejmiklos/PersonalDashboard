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
  /** HTTP status of the provider's answer, when there was one. */
  readonly status: number | undefined;
  /** Seconds the provider asked us to wait (`Retry-After`). */
  readonly retryAfterSec: number | undefined;

  constructor(message: string, details: { status?: number; retryAfterSec?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = details.status;
    this.retryAfterSec = details.retryAfterSec;
  }
}

const TIMEOUT_MS = 8_000;

/** `Retry-After` as seconds; the HTTP-date form is not used by the providers we call. */
function parseRetryAfter(value: string | null): number | undefined {
  const seconds = value === null ? NaN : Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** GETs JSON from a provider with a timeout; non-2xx and non-JSON bodies are a ProviderError. */
export async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After'));
    throw new ProviderError(`HTTP ${res.status}`, {
      status: res.status,
      ...(retryAfterSec !== undefined && { retryAfterSec }),
    });
  }
  try {
    return await res.json();
  } catch {
    throw new ProviderError('Response is not JSON');
  }
}
