import { LOCALES, isLocale, type AppSettings, type Locale, type MessageKey } from '@dashboard/shared';
import { useState } from 'preact/hooks';
import type { Api } from './api';
import { useI18n } from './i18n';
import { useLoad } from './load';
import { buildLocation, isTimeZone, knownTimeZones } from './settings-model';
import { ErrorNote, Loading } from './ui';

const LOCALE_NAMES: Record<Locale, string> = { sk: 'Slovenčina', en: 'English' };

function SettingsForm({ api, settings }: { api: Api; settings: AppSettings }) {
  const { t } = useI18n();
  const [locale, setLocale] = useState<Locale>(settings.locale);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [place, setPlace] = useState(settings.location?.label ?? '');
  const [lat, setLat] = useState(settings.location ? String(settings.location.lat) : '');
  const [lon, setLon] = useState(settings.location ? String(settings.location.lon) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);

  /** Sends only the given fields; the server answers with the settings as stored. */
  async function save(patch: Partial<AppSettings>): Promise<void> {
    setBusy(true);
    setError(null);
    setProblem(null);
    setSaved(false);
    try {
      const stored = await api.put<AppSettings>('/api/v1/settings', patch);
      setLocale(stored.locale);
      setTimezone(stored.timezone);
      setPlace(stored.location?.label ?? '');
      setLat(stored.location ? String(stored.location.lat) : '');
      setLon(stored.location ? String(stored.location.lon) : '');
      setSaved(true);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function saveTimezone(): void {
    const zone = timezone.trim();
    if (!isTimeZone(zone)) setProblem('admin.settings.invalidZone');
    else void save({ timezone: zone });
  }

  function saveLocation(): void {
    const location = buildLocation(place, lat, lon);
    if (location === null) setProblem('admin.settings.invalidLocation');
    else void save({ location });
  }

  return (
    <>
      <article class="card">
        <label class="field">
          <strong>{t('admin.settings.locale')}</strong>
          <select
            value={locale}
            disabled={busy}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isLocale(next)) void save({ locale: next });
            }}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
      </article>

      <article class="card">
        <label class="field">
          <strong>{t('admin.settings.timezone')}</strong>
          <span class="muted">{t('admin.settings.timezoneHint')}</span>
          <input
            type="text"
            list="time-zones"
            autocomplete="off"
            value={timezone}
            onInput={(event) => setTimezone(event.currentTarget.value)}
          />
        </label>
        <datalist id="time-zones">
          {knownTimeZones().map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <div class="actions">
          <button type="button" class="primary" disabled={busy} onClick={saveTimezone}>
            {t('admin.settings.save')}
          </button>
        </div>
      </article>

      <article class="card">
        <strong>{t('admin.settings.location')}</strong>
        <p class="muted">{t('admin.settings.locationHint')}</p>
        <div class="source-fields">
          <label class="field">
            <span>{t('admin.settings.place')}</span>
            <input
              type="text"
              maxLength={64}
              value={place}
              onInput={(event) => setPlace(event.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span>{t('admin.settings.lat')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              onInput={(event) => setLat(event.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span>{t('admin.settings.lon')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={lon}
              onInput={(event) => setLon(event.currentTarget.value)}
            />
          </label>
        </div>
        <div class="actions">
          <button type="button" class="primary" disabled={busy} onClick={saveLocation}>
            {t('admin.settings.save')}
          </button>
          {settings.location !== null && (
            <button
              type="button"
              class="danger"
              disabled={busy}
              onClick={() => void save({ location: null })}
            >
              {t('admin.settings.clear')}
            </button>
          )}
        </div>
      </article>

      {problem !== null && (
        <div class="note error" role="alert">
          {t(problem)}
        </div>
      )}
      {error !== null && <ErrorNote error={error} />}
      {saved && (
        <div class="note ok" role="status">
          {t('admin.settings.saved')}
        </div>
      )}
    </>
  );
}

export function SettingsScreen({ api }: { api: Api }) {
  const { t } = useI18n();
  const settings = useLoad(() => api.get<AppSettings>('/api/v1/settings'));
  return (
    <section>
      <h1>{t('admin.nav.settings')}</h1>
      {settings.error !== null && settings.data === null && (
        <ErrorNote error={settings.error} onRetry={settings.reload} />
      )}
      {settings.data === null && settings.error === null && <Loading />}
      {settings.data !== null && <SettingsForm api={api} settings={settings.data} />}
    </section>
  );
}
