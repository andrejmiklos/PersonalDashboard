import type { AppSettings, LayoutDocument, LayoutSummary } from '@dashboard/shared';
import { useRef, useState } from 'preact/hooks';
import { ApiError, type Api } from './api';
import { downloadJson } from './download';
import { useI18n } from './i18n';
import { cleanName, emptyLayout, exportFileName, formatUpdated, parseImport, toBody } from './layouts-model';
import { useLoad } from './load';
import { navigate } from './router';
import { ErrorNote, Loading } from './ui';

export function LayoutsScreen({ api }: { api: Api }) {
  const { t, locale } = useI18n();
  const layouts = useLoad(() => api.get<LayoutSummary[]>('/api/v1/layouts'));
  const settings = useLoad(() => api.get<AppSettings>('/api/v1/settings'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** One action at a time; the list is loaded again afterwards, also after a failure. */
  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
      layouts.reload();
      settings.reload();
    }
  }

  const create = () =>
    run(async () => {
      const created = await api.post<LayoutDocument>('/api/v1/layouts', emptyLayout(t('admin.layouts.new')));
      navigate(`/layouts/${created.id}`);
    });
  const duplicate = (id: string) => run(() => api.post(`/api/v1/layouts/${id}/duplicate`));
  const makeDefault = (id: string) => run(() => api.put('/api/v1/settings', { defaultLayoutId: id }));

  function rename(layout: LayoutSummary): Promise<void> {
    const name = cleanName(window.prompt(t('admin.layouts.renamePrompt'), layout.name) ?? '');
    if (name === null || name === layout.name) return Promise.resolve();
    return run(async () => {
      const full = await api.get<LayoutDocument>(`/api/v1/layouts/${layout.id}`);
      await api.put(`/api/v1/layouts/${layout.id}`, { ...toBody(full), name, ifVersion: full.version });
    });
  }

  function remove(layout: LayoutSummary): Promise<void> {
    if (!window.confirm(t('admin.layouts.deleteConfirm', { name: layout.name }))) return Promise.resolve();
    return run(() => api.delete(`/api/v1/layouts/${layout.id}`));
  }

  function exportLayout(layout: LayoutSummary): Promise<void> {
    return run(async () => {
      const full = await api.get<LayoutDocument>(`/api/v1/layouts/${layout.id}`);
      downloadJson(exportFileName(full.name), toBody(full));
    });
  }

  function importFile(file: File): Promise<void> {
    return run(async () => {
      const body = parseImport(await file.text());
      if (body === null) throw new ApiError(0, 'invalid_file', 'Not a JSON object');
      await api.post('/api/v1/layouts', body);
    });
  }

  const failed = layouts.error ?? settings.error;
  const list = layouts.data;
  const defaultId = settings.data?.defaultLayoutId ?? null;

  return (
    <section>
      <h1>{t('admin.nav.layouts')}</h1>
      <div class="actions">
        <button type="button" class="primary" disabled={busy} onClick={() => void create()}>
          {t('admin.layouts.new')}
        </button>
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          {t('admin.layouts.import')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>

      {error !== null && <ErrorNote error={error} />}
      {failed !== null && list === null && <ErrorNote error={failed} onRetry={layouts.reload} />}
      {list === null && failed === null && <Loading />}
      {list !== null && list.length === 0 && <p class="muted">{t('admin.layouts.empty')}</p>}
      {list !== null && (
        <ul class="plain">
          {list.map((layout) => (
            <li key={layout.id} class="card">
              <div class="card-head">
                <div class="grow">
                  <strong>{layout.name}</strong>
                  {layout.id === defaultId && <span class="badge ok tag">{t('admin.layouts.default')}</span>}
                  <div class="muted">
                    {t('admin.layouts.tiles', { n: layout.tileCount })} · v{layout.version} ·{' '}
                    {formatUpdated(layout.updatedAt, locale)}
                  </div>
                </div>
              </div>
              <div class="actions">
                <a class="button primary" href={`#/layouts/${layout.id}`}>
                  {t('admin.layouts.edit')}
                </a>
                {layout.id !== defaultId && (
                  <button type="button" disabled={busy} onClick={() => void makeDefault(layout.id)}>
                    {t('admin.layouts.setDefault')}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => void duplicate(layout.id)}>
                  {t('admin.layouts.duplicate')}
                </button>
                <button type="button" disabled={busy} onClick={() => void rename(layout)}>
                  {t('admin.layouts.rename')}
                </button>
                <button type="button" disabled={busy} onClick={() => void exportLayout(layout)}>
                  {t('admin.layouts.export')}
                </button>
                <button type="button" class="danger" disabled={busy} onClick={() => void remove(layout)}>
                  {t('admin.layouts.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
