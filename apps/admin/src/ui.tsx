import { useI18n } from './i18n';
import { errorKey } from './errors';

/** Why a call failed, in the user's language; `onRetry` adds a button. */
export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div class="note error" role="alert">
      <span>{t(errorKey(error))}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t('admin.retry')}
        </button>
      )}
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return <p class="muted">{t('state.loading')}</p>;
}
