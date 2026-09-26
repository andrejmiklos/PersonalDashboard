import { LOCALES, type MessageKey } from '@dashboard/shared';
import { useEffect } from 'preact/hooks';
import { AccountsScreen } from './accounts-screen';
import type { Api } from './api';
import { useI18n } from './i18n';
import { LayoutsScreen } from './layouts-screen';
import { navigate, useRoute, type Route } from './router';

interface Section {
  path: string;
  label: MessageKey;
}

const SECTIONS: readonly Section[] = [
  { path: '/layouts', label: 'admin.nav.layouts' },
  { path: '/accounts', label: 'admin.nav.accounts' },
];

function Screen({ section, api, route }: { section: Section; api: Api; route: Route }) {
  return section.path === '/accounts' ? (
    <AccountsScreen api={api} route={route} />
  ) : (
    <LayoutsScreen api={api} />
  );
}

export function Shell({ api, onLogout }: { api: Api; onLogout: () => void }) {
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
      <main>{section && <Screen section={section} api={api} route={route} />}</main>
    </div>
  );
}
