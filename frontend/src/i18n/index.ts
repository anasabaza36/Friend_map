import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export type Locale = 'en' | 'fr' | 'ar';

export const DEFAULT_LOCALE: Locale = 'en';
const STORAGE_KEY = 'tripteck-locale';

export function loadInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr' || stored === 'ar') {
      return stored;
    }
  } catch {
    // ignore
  }
  const nav = navigator.language?.toLowerCase() ?? '';
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('ar')) return 'ar';
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

const i18n = createI18n({
  legacy: false,
  locale: loadInitialLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { en, fr, ar },
});

export default i18n;
