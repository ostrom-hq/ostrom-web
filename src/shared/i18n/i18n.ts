import i18n, { type BackendModule } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { type Language, LANGUAGES, type LocaleShape } from '@/shared/i18n/types';

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

type Wordings = Readonly<Record<Language, () => Promise<LocaleShape>>>;

/** Each language's wording is a chunk of its own: a visit downloads the language it shows, never all of them. */
const WORDINGS: Wordings = {
  en: async () => (await import('@/shared/i18n/locales/en')).en,
  fr: async () => (await import('@/shared/i18n/locales/fr')).fr,
};

/** Hands i18next a language's wording when it needs it: at start, and when the person picks another language. */
export function wordingBackend(wordings: Wordings = WORDINGS): BackendModule {
  return {
    type: 'backend',
    init: () => undefined,
    read(language, _namespace, callback) {
      const known = LANGUAGES.find((one) => one === language);
      if (known === undefined) {
        callback(new Error(`no wording for the language ${language}`), false);
        return;
      }
      wordings[known]().then(
        (wording) => {
          callback(null, wording);
        },
        // `true`: a chunk that did not come (a network drop) is asked again, a few times, before giving up.
        (error: unknown) => {
          callback(new Error(`the wording of ${known} did not load`, { cause: error }), true);
        },
      );
    },
  };
}

i18n.on('languageChanged', syncDocumentLanguage);
// The person changes the browser's language: the console follows, and i18next loads that wording before showing it.
window.addEventListener('languagechange', () => {
  void i18n.changeLanguage(pickLanguage(navigator.languages));
});

/**
 * Settles once the wording of the language shown is in. The console renders only then (main.tsx): no screen of bare
 * keys, and no English replaced by French a moment later.
 */
export const i18nReady: Promise<unknown> = i18n
  .use(wordingBackend())
  .use(initReactI18next)
  .init({
    lng: pickLanguage(navigator.languages),
    // No fallback: every language has every key (LocaleShape), and a fallback would download English for French too.
    fallbackLng: false,
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
  });

export { i18n };
