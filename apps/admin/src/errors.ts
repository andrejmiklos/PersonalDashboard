import type { MessageKey } from '@dashboard/shared';
import { ApiError } from './api';

const ERROR_KEYS: Record<string, MessageKey> = {
  network: 'admin.error.network',
  reauth_required: 'admin.error.reauth',
  provider_unavailable: 'admin.error.unavailable',
  not_configured: 'admin.error.notConfigured',
  layout_in_use: 'admin.error.layoutInUse',
  version_conflict: 'admin.error.conflict',
  payload_too_large: 'admin.error.tooLarge',
  validation_error: 'admin.error.validation',
  invalid_file: 'admin.error.invalidFile',
  not_found: 'admin.error.notFound',
};

/** The message for a failed call; the server's own text is English only, see {@link errorDetail}. */
export function errorKey(error: unknown): MessageKey {
  return (error instanceof ApiError && ERROR_KEYS[error.code]) || 'admin.error.generic';
}

/**
 * The server's message for a refused input: it names the offending field (`tiles.2: c1 overlaps c3`), which
 * helps more than a translation could. Other errors have no detail.
 */
export function errorDetail(error: unknown): string | null {
  return error instanceof ApiError && error.code === 'validation_error' ? error.message : null;
}
