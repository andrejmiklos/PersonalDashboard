import type { AccountSummary, DiscoveredItem } from '@dashboard/shared';
import { useState } from 'preact/hooks';
import type { Api } from './api';
import { hexColor } from './accounts-model';
import { useI18n } from './i18n';
import { useLoad } from './load';
import { ErrorNote, Loading } from './ui';

/** The calendars or lists that exist at the provider; adding one makes it a source the tiles can use. */
export function DiscoverPanel({
  api,
  account,
  onAdded,
}: {
  api: Api;
  account: AccountSummary;
  onAdded: () => void;
}) {
  const { t } = useI18n();
  const items = useLoad(() => api.get<DiscoveredItem[]>(`/api/v1/accounts/${account.id}/discover`));
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<unknown>(null);

  async function add(remoteId: string): Promise<void> {
    setAdding(remoteId);
    setAddError(null);
    try {
      await api.post(`/api/v1/accounts/${account.id}/sources`, { remoteId });
      items.reload();
      onAdded();
    } catch (failure) {
      setAddError(failure);
    } finally {
      setAdding(null);
    }
  }

  if (items.error !== null && items.data === null)
    return <ErrorNote error={items.error} onRetry={items.reload} />;
  if (items.data === null) return <Loading />;
  return (
    <div class="discover">
      <ul class="plain">
        {items.data.map((item) => {
          const color = hexColor(item.color);
          return (
            <li key={item.remoteId} class="discover-item">
              {color && <span class="swatch" style={{ background: color }} />}
              <span class="grow">
                {item.label}
                <span class="muted">
                  {' '}
                  ·{' '}
                  {t(
                    item.kind === 'calendar' ? 'admin.sources.kind.calendar' : 'admin.sources.kind.task_list',
                  )}
                </span>
              </span>
              {item.sourceId !== null ? (
                <span class="muted">{t('admin.sources.added')}</span>
              ) : (
                <button type="button" disabled={adding !== null} onClick={() => void add(item.remoteId)}>
                  {t('admin.sources.addOne')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {addError !== null && <ErrorNote error={addError} />}
    </div>
  );
}
