import { DEFAULT_LOCALE, isLocale, t as translate, type Locale, type MessageKey } from '@dashboard/shared';
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { readItem, safeLocalStorage, writeItem } from './storage';

const LOCALE_KEY = 'admin.locale';
const storage = safeLocalStorage();

type Params = Record<string, string | number>;

interface I18n {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, params?: Params): string;
}

/** Stored choice first; otherwise Slovak for a Slovak browser and English for anything else. */
export function initialLocale(stored: string | null, browserLanguage: string): Locale {
  if (isLocale(stored)) return stored;
  return browserLanguage.toLowerCase().startsWith('sk') ? DEFAULT_LOCALE : 'en';
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    initialLocale(readItem(storage, LOCALE_KEY), navigator.language),
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeItem(storage, LOCALE_KEY, next);
    setLocaleState(next);
  }, []);
  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
