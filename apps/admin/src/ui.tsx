import { errorDetail, errorKey } from './errors';
import { useI18n } from './i18n';

/** Why a call failed, in the user's language; `onRetry` adds a button. */
export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const detail = errorDetail(error);
  return (
    <div class="note error" role="alert">
      <span>
        {t(errorKey(error))}
        {detail && <code class="detail"> {detail}</code>}
      </span>
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
