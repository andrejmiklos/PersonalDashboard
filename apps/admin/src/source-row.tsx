import type { SourceRecord } from '@dashboard/shared';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from './api';
import { cleanLabel } from './accounts-model';
import { useI18n } from './i18n';
import { ErrorNote } from './ui';

const FALLBACK_COLOR = '#4f9dff';

/** One chosen calendar or list: name, colour and whether tiles may show it. */
export function SourceRow({
  api,
  source,
  onChanged,
}: {
  api: Api;
  source: SourceRecord;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(source.label);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setLabel(source.label), [source.label]);

  async function save(patch: { label?: string; color?: string; enabled?: boolean }): Promise<void> {
    try {
      await api.put(`/api/v1/sources/${source.id}`, patch);
      setError(null);
      onChanged();
    } catch (failure) {
      setError(failure);
    }
  }

  function commitLabel(): void {
    const clean = cleanLabel(label);
    if (clean === null) setLabel(source.label);
    else if (clean !== source.label) void save({ label: clean });
  }

  return (
    <li class="source">
      <div class="source-fields">
        <label class="field">
          <span class="muted">{t('admin.sources.name')}</span>
          <input
            type="text"
            maxLength={80}
            value={label}
            onInput={(event) => setLabel(event.currentTarget.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
        </label>
        <label class="field">
          <span class="muted">{t('admin.sources.color')}</span>
          <input
            type="color"
            value={source.color ?? FALLBACK_COLOR}
            onChange={(event) => void save({ color: event.currentTarget.value })}
          />
        </label>
        <label class="check">
          <input
            type="checkbox"
            checked={source.enabled}
            onChange={(event) => void save({ enabled: event.currentTarget.checked })}
          />
          <span>{t('admin.sources.show')}</span>
        </label>
      </div>
      <span class="muted kind">
        {t(source.kind === 'calendar' ? 'admin.sources.kind.calendar' : 'admin.sources.kind.task_list')}
      </span>
      {error !== null && <ErrorNote error={error} />}
    </li>
  );
}
