import type { AccountProviderId, AccountSummary, SourceRecord } from '@dashboard/shared';
import { useEffect, useState } from 'preact/hooks';
import { AccountCard } from './account-card';
import { ApiError, type Api } from './api';
import { flashFrom, PROVIDERS, safeAuthorizationUrl, sourcesOf } from './accounts-model';
import { useI18n } from './i18n';
import { useLoad } from './load';
import type { Route } from './router';
import { ErrorNote, Loading } from './ui';

export function AccountsScreen({ api, route }: { api: Api; route: Route }) {
  const { t } = useI18n();
  const accounts = useLoad(() => api.get<AccountSummary[]>('/api/v1/accounts'));
  const sources = useLoad(() => api.get<SourceRecord[]>('/api/v1/sources'));
  const [connecting, setConnecting] = useState<AccountProviderId | null>(null);
  const [connectError, setConnectError] = useState<unknown>(null);

  // The OAuth callback returns to `#/accounts?connected=…`; the result is shown once and the address cleaned.
  const [flash] = useState(() => flashFrom(route.params));
  useEffect(() => {
    if (route.params.toString() !== '') window.history.replaceState(null, '', '#/accounts');
  }, []);

  async function connect(provider: AccountProviderId): Promise<void> {
    setConnecting(provider);
    setConnectError(null);
    try {
      const started = await api.post<{ url?: unknown }>(`/api/v1/admin/oauth/${provider}/start`);
      const target = safeAuthorizationUrl(started.url);
      if (target === null) throw new ApiError(0, 'invalid_url', 'The server sent no usable address');
      window.location.assign(target);
    } catch (failure) {
      setConnectError(failure);
      setConnecting(null);
    }
  }

  function refresh(): void {
    accounts.reload();
    sources.reload();
  }

  const failed = accounts.error ?? sources.error;
  const accountList = accounts.data;
  const sourceList = sources.data;
  const ready = accountList !== null && sourceList !== null;

  return (
    <section>
      <h1>{t('admin.nav.accounts')}</h1>

      {flash && (
        <div class={flash.kind === 'connected' ? 'note ok' : 'note error'} role="status">
          {flash.kind === 'connected'
            ? t('admin.accounts.connected')
            : t(`admin.accounts.flash.${flash.code}`)}
        </div>
      )}

      {failed !== null && !ready && <ErrorNote error={failed} onRetry={refresh} />}
      {!ready && failed === null && <Loading />}
      {ready && accountList.length === 0 && <p class="muted">{t('admin.accounts.empty')}</p>}
      {ready &&
        accountList.map((account) => (
          <AccountCard
            key={account.id}
            api={api}
            account={account}
            sources={sourcesOf(account.id, sourceList)}
            onSourcesChanged={sources.reload}
            onRemoved={refresh}
            onReconnect={() => void connect(account.provider)}
            reconnecting={connecting === account.provider}
          />
        ))}

      <h2>{t('admin.accounts.connect')}</h2>
      <div class="actions">
        {PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={connecting !== null}
            onClick={() => void connect(provider)}
          >
            {t(
              provider === 'google' ? 'admin.accounts.provider.google' : 'admin.accounts.provider.microsoft',
            )}
          </button>
        ))}
      </div>
      {connectError !== null && <ErrorNote error={connectError} />}
    </section>
  );
}
