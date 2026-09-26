import type { MessageKey } from '@dashboard/shared';
import { ApiError } from './api';

const ERROR_KEYS: Record<string, MessageKey> = {
  network: 'admin.error.network',
  reauth_required: 'admin.error.reauth',
  provider_unavailable: 'admin.error.unavailable',
  not_configured: 'admin.error.notConfigured',
};

/** The message for a failed call; the server's own text is not shown, it is English only. */
export function errorKey(error: unknown): MessageKey {
  return (error instanceof ApiError && ERROR_KEYS[error.code]) || 'admin.error.generic';
}
