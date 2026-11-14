import { takeFirstWording, type Wording } from '@/shared/i18n/firstWording';
import { createI18n, type I18n } from '@/shared/i18n/instance';
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

/** The first screen's wording `/boot.js` fetched for a language, if any (src/shared/i18n/firstWording.ts). */
type FirstWording = (language: Language) => Promise<Wording | undefined> | undefined;

/**
 * A chunk that did not come (a network drop) is asked twice more, 350 ms then 700 ms later, before English takes
 * over: about a second.
 */
const RETRY_DELAYS_MS: readonly number[] = [350, 700];

/** Brings a language's wording in, and says whether it could. */
export type LoadWording = (language: string) => Promise<boolean>;

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A language's whole wording, asked again after each of `delays` when it does not come. */
async function wholeWording(
  load: () => Promise<LocaleShape>,
  delays: readonly number[],
): Promise<LocaleShape | undefined> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load();
    } catch {
      const delay = delays[attempt];
      if (delay === undefined) return undefined;
      await wait(delay);
    }
  }
}

/**
 * Hands `instance` a language's wording when it needs it: at start, and when the person picks another language.
 *
 * At start, the first screen's own wording, if `/boot.js` fetched it: only the sections that screen shows, a few KB
 * where the whole language is some twenty, and so the first paint comes sooner on a slow network. The whole
 * language follows once that is handed over, merged in (the screens render again on `added`), for every other
 * screen. Without it, or if it did not come, the whole language at once, as before.
 */
export function wordingLoader(
  instance: I18n,
  wordings: Wordings = WORDINGS,
  first: FirstWording = takeFirstWording,
  retryDelays: readonly number[] = RETRY_DELAYS_MS,
): LoadWording {
  return async (language) => {
    const known = LANGUAGES.find((one) => one === language);
    if (known === undefined) return Promise.resolve(false);
    const whole = async (): Promise<boolean> => {
      const wording = await wholeWording(wordings[known], retryDelays);
      if (wording === undefined) return false;
      instance.addResourceBundle(known, wording);
      return true;
    };
    // Asked at once, not after a turn: the first render waits for this very read.
    const early = first(known);
    if (early === undefined) return whole();
    return early.then(async (wording) => {
      if (wording === undefined) return whole();
      instance.addResourceBundle(known, wording);
      // The first screen keeps its words; another screen opened without network could not load either.
      void wordings[known]().then(
        (all) => {
          instance.addResourceBundle(known, all);
        },
        () => undefined,
      );
      return true;
    });
  };
}

/** The console's words: its language is shown as soon as it is picked, before any wording is in (`t` gives keys). */
export const i18n: I18n = createI18n(pickLanguage(navigator.languages));

const loadWording: LoadWording = wordingLoader(i18n);

/**
 * Shows `language` once its wording is in, and says whether it could. A wording that does not come (a network drop,
 * after the retries) leaves the screen on the words it has; it is asked for anew the next time.
 */
export async function showLanguage(
  language: Language,
  instance: I18n = i18n,
  stillWanted: () => boolean = () => true,
  load: LoadWording = loadWording,
): Promise<boolean> {
  if (!instance.hasResourceBundle(language)) await load(language);
  if (!instance.hasResourceBundle(language)) return false;
  // A newer change asked for while this wording came wins: an older one never shows over it.
  if (!stillWanted()) return false;
  instance.changeLanguage(language);
  return true;
}

/**
 * At start, a language whose wording did not come gives way to English, the console's first language. Without English
 * either (no network at all), the console shows its keys: the screens could not load their data anyway.
 */
export async function englishIfMissing(
  instance: I18n = i18n,
  load: LoadWording = loadWording,
): Promise<void> {
  if (instance.hasResourceBundle(instance.language)) return;
  await showLanguage('en', instance, () => true, load);
}

/** The person changes the browser's language: the console follows, once that wording is in. */
export function followBrowserLanguage(): void {
  const picked = pickLanguage(navigator.languages);
  if (picked === i18n.language) return;
  void showLanguage(picked, i18n, () => pickLanguage(navigator.languages) === picked);
}

i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.language);

/**
 * Settles once the wording of the language shown is in (or English's, englishIfMissing). The console renders only
 * then (main.tsx): no English replaced by French a moment later.
 */
export const i18nReady: Promise<void> = loadWording(i18n.language)
  .then(async () => englishIfMissing())
  .then(() => {
    // Listened to once the start is settled: a change during it would race the start's own wording.
    window.addEventListener('languagechange', followBrowserLanguage);
  });
