import { LOCALES, type MessageKey } from '@dashboard/shared';
import { useEffect } from 'preact/hooks';
import { useI18n } from './i18n';
import { navigate, useRoute } from './router';

interface Section {
  path: string;
  label: MessageKey;
}

const SECTIONS: readonly Section[] = [
  { path: '/layouts', label: 'admin.nav.layouts' },
  { path: '/accounts', label: 'admin.nav.accounts' },
];

function Screen({ section }: { section: Section }) {
  const { t } = useI18n();
  return (
    <section>
      <h1>{t(section.label)}</h1>
      <p class="muted">{t('admin.soon')}</p>
    </section>
  );
}

export function Shell({ onLogout }: { onLogout: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const route = useRoute();
  const section = SECTIONS.find((s) => s.path === route.path);
  useEffect(() => {
    if (!section) navigate('/layouts');
  }, [section]);

  return (
    <div class="shell">
      <header>
        <strong class="brand">{t('admin.title')}</strong>
        <nav aria-label={t('admin.nav.label')}>
          {SECTIONS.map((s) => (
            <a href={`#${s.path}`} aria-current={s === section ? 'page' : undefined}>
              {t(s.label)}
            </a>
          ))}
        </nav>
        <div class="tools">
          <div role="group" aria-label={t('admin.language')} class="segmented">
            {LOCALES.map((code) => (
              <button type="button" aria-pressed={code === locale} onClick={() => setLocale(code)}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={onLogout}>
            {t('admin.logout')}
          </button>
        </div>
      </header>
      <main>{section && <Screen section={section} />}</main>
    </div>
  );
}
