import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';
import { type Language, LANGUAGES } from '@/shared/i18n/types';

export function pickLanguage(candidates: readonly string[]): Language {
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];
    const match = LANGUAGES.find((language) => language === base);
    if (match !== undefined) return match;
  }
  return 'en';
}

/** Keeps <html lang> on the language actually shown, for screen readers and hyphenation. */
export function syncDocumentLanguage(language: string): void {
  document.documentElement.lang = language;
}

i18n.on('languageChanged', syncDocumentLanguage);

void i18n.use(initReactI18next).init({
  lng: pickLanguage(navigator.languages),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  resources: { en: { translation: en }, fr: { translation: fr } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

export { i18n };
