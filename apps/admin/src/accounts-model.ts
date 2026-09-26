import type { AccountProviderId, SourceRecord } from '@dashboard/shared';

export const PROVIDERS: readonly AccountProviderId[] = ['google', 'microsoft'];

export type Flash = { kind: 'connected'; provider: AccountProviderId } | { kind: 'error'; code: FlashError };
export type FlashError = 'denied' | 'invalid_state' | 'failed';

const FLASH_ERRORS: readonly FlashError[] = ['denied', 'invalid_state', 'failed'];

/** The result the OAuth callback appends to `#/accounts?…` (docs/10-operations.md §4.2). */
export function flashFrom(params: URLSearchParams): Flash | null {
  const connected = params.get('connected');
  const provider = PROVIDERS.find((p) => p === connected);
  if (provider) return { kind: 'connected', provider };
  const error = params.get('error');
  if (error === null) return null;
  return { kind: 'error', code: FLASH_ERRORS.find((code) => code === error) ?? 'failed' };
}

/** The address the provider's sign-in page has, from the Worker; anything but https is not followed. */
export function safeAuthorizationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sourcesOf(accountId: string, sources: readonly SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.accountId === accountId);
}

const MAX_LABEL = 80;

/** A source name as the API accepts it: 1–80 characters after trimming. */
export function cleanLabel(value: string): string | null {
  const label = value.trim();
  return label.length >= 1 && label.length <= MAX_LABEL ? label : null;
}

/** `#rrggbb` as the colour input and the API use it; anything else (a provider's hint may be odd) is dropped. */
export function hexColor(value: string | null): string | null {
  return value !== null && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}
