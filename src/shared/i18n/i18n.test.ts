import type { ReadCallback } from 'i18next';
import { i18n, i18nReady, pickLanguage, wordingBackend } from '@/shared/i18n/i18n';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';

// First: the start is read before any other test changes the language.
describe('the start', () => {
  it('loads the language of the browser, and nothing else', async () => {
    await i18nReady;
    expect(i18n.language).toBe('en');
    expect(i18n.t('app.loading')).toBe(en.app.loading);
    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(false);
  });
});

describe('pickLanguage', () => {
  it('takes the first supported browser language', () => {
    expect(pickLanguage(['de-DE', 'fr-FR', 'en-US'])).toBe('fr');
  });

  it('falls back to English', () => {
    expect(pickLanguage(['de-DE'])).toBe('en');
    expect(pickLanguage([])).toBe('en');
  });
});

describe('document language', () => {
  it('follows the language shown', async () => {
    expect(document.documentElement.lang).toBe('en');
    await i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
    await i18n.changeLanguage('en');
  });
});

/** What the backend answered to one read. */
async function read(
  backend: ReturnType<typeof wordingBackend>,
  language: string,
): Promise<Parameters<ReadCallback>> {
  return new Promise((resolve) => {
    backend.read(language, 'translation', (...answer) => {
      resolve(answer);
    });
  });
}

describe('loading only the language shown', () => {
  it('loads the other language when it is chosen, before showing it', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('app.loading')).toBe(fr.app.loading);
    await i18n.changeLanguage('en');
  });

  it('reads a language from its own chunk', async () => {
    const [error, wording] = await read(wordingBackend(), 'fr');
    expect(error).toBeNull();
    expect(wording).toBe(fr);
  });

  it('has no wording for a language the console does not speak', async () => {
    const [error, retry] = await read(wordingBackend(), 'de');
    expect(String(error)).toContain('de');
    expect(retry).toBe(false);
  });

  it('asks i18next to try again when a chunk does not come', async () => {
    const offline = new TypeError('Failed to fetch dynamically imported module');
    const backend = wordingBackend({
      en: async () => Promise.reject(offline),
      fr: async () => Promise.resolve(fr),
    });
    const [error, retry] = await read(backend, 'en');
    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error && error.cause).toBe(offline);
    expect(retry).toBe(true);
  });

  it('follows the browser when its language changes, loading the new wording first', async () => {
    const shown = new Promise((resolve) => {
      i18n.on('languageChanged', resolve);
    });
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-BE', 'en'] });
    window.dispatchEvent(new Event('languagechange'));
    expect(await shown).toBe('fr');
    expect(i18n.t('app.loading')).toBe(fr.app.loading);
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] });
    await i18n.changeLanguage('en');
  });
});
