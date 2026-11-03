import i18n, { type BackendModule, type i18n as I18n } from 'i18next';
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

/**
 * Shows `language` once its wording is in, and says whether it could. A wording that does not come (a network drop,
 * after i18next asked again) leaves the screen on the words it has; it is asked for anew the next time, as i18next
 * would otherwise never ask again for a language that failed once.
 */
export async function showLanguage(
  language: Language,
  instance: I18n = i18n,
  stillWanted: () => boolean = () => true,
): Promise<boolean> {
  if (!instance.hasResourceBundle(language, 'translation'))
    await instance.reloadResources(language, 'translation');
  if (!instance.hasResourceBundle(language, 'translation')) return false;
  // A newer change asked for while this wording came wins: an older one never shows over it.
  if (!stillWanted()) return false;
  await instance.changeLanguage(language);
  return true;
}

/**
 * At start, a language whose wording did not come gives way to English, the console's first language. Without English
 * either (no network at all), the console shows its keys: the screens could not load their data anyway.
 */
export async function englishIfMissing(instance: I18n = i18n): Promise<void> {
  if (instance.hasResourceBundle(instance.language, 'translation')) return;
  await showLanguage('en', instance);
}

/** The person changes the browser's language: the console follows, once that wording is in. */
export function followBrowserLanguage(): void {
  const picked = pickLanguage(navigator.languages);
  if (picked === i18n.language) return;
  void showLanguage(picked, i18n, () => pickLanguage(navigator.languages) === picked);
}

i18n.on('languageChanged', syncDocumentLanguage);

/**
 * Settles once the wording of the language shown is in (or English's, englishIfMissing). The console renders only
 * then (main.tsx): no English replaced by French a moment later.
 */
export const i18nReady: Promise<void> = i18n
  .use(wordingBackend())
  .use(initReactI18next)
  .init({
    lng: pickLanguage(navigator.languages),
    // No fallback: every language has every key (LocaleShape), and a fallback would download English for French too.
    fallbackLng: false,
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
    // A chunk that did not come is asked twice more, 350 ms then 700 ms later, before English takes over: about a
    // second, not the eleven of i18next's five tries.
    maxRetries: 2,
  })
  .then(async () => englishIfMissing())
  .then(() => {
    // Listened to once the start is settled: a change during it would race the start's own wording.
    window.addEventListener('languagechange', followBrowserLanguage);
  });

export { i18n };
