import type { AccountSummary, SourceRecord } from '@dashboard/shared';
import { useState } from 'preact/hooks';
import type { Api } from './api';
import { DiscoverPanel } from './discover-panel';
import { useI18n } from './i18n';
import { SourceRow } from './source-row';
import { ErrorNote } from './ui';

export function AccountCard({
  api,
  account,
  sources,
  onSourcesChanged,
  onRemoved,
  onReconnect,
  reconnecting,
}: {
  api: Api;
  account: AccountSummary;
  sources: readonly SourceRecord[];
  onSourcesChanged: () => void;
  onRemoved: () => void;
  onReconnect: () => void;
  reconnecting: boolean;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const needsReconnect = account.status === 'reauth_required';

  async function remove(): Promise<void> {
    if (!window.confirm(t('admin.accounts.removeConfirm'))) return;
    try {
      await api.delete(`/api/v1/accounts/${account.id}`);
      onRemoved();
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <article class="card">
      <header class="card-head">
        <div class="grow">
          <strong>
            {t(
              account.provider === 'google'
                ? 'admin.accounts.provider.google'
                : 'admin.accounts.provider.microsoft',
            )}
          </strong>
          {account.displayName && <span class="muted"> · {account.displayName}</span>}
        </div>
        <span class={needsReconnect ? 'badge warn' : 'badge ok'}>
          {t(needsReconnect ? 'admin.accounts.status.reauth_required' : 'admin.accounts.status.ok')}
        </span>
      </header>

      {sources.length === 0 ? (
        <p class="muted">{t('admin.sources.none')}</p>
      ) : (
        <ul class="plain sources">
          {sources.map((source) => (
            <SourceRow key={source.id} api={api} source={source} onChanged={onSourcesChanged} />
          ))}
        </ul>
      )}

      {adding && <DiscoverPanel api={api} account={account} onAdded={onSourcesChanged} />}
      {error !== null && <ErrorNote error={error} />}

      <div class="actions">
        {needsReconnect && (
          <button type="button" class="primary" disabled={reconnecting} onClick={onReconnect}>
            {t('admin.accounts.reconnect')}
          </button>
        )}
        <button type="button" onClick={() => setAdding(!adding)}>
          {t(adding ? 'admin.sources.close' : 'admin.sources.add')}
        </button>
        <button type="button" class="danger" onClick={() => void remove()}>
          {t('admin.accounts.remove')}
        </button>
      </div>
    </article>
  );
}
