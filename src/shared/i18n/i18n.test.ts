import i18next, { type ReadCallback } from 'i18next';
import {
  englishIfMissing,
  i18n,
  i18nReady,
  pickLanguage,
  showLanguage,
  wordingBackend,
} from '@/shared/i18n/i18n';
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
});

describe("the first screen's own wording", () => {
  type Wordings = Parameters<typeof wordingBackend>[0];
  type First = Parameters<typeof wordingBackend>[1];

  /** An i18next started on these wordings, as the console starts, the whole language merged into it. */
  async function started(wordings: Wordings, first: First): Promise<typeof i18next> {
    const instance = i18next.createInstance();
    await instance
      .use(
        wordingBackend(wordings, first, (language, wording) => {
          instance.addResourceBundle(language, 'translation', wording, true, true);
        }),
      )
      .init({ lng: 'en', fallbackLng: false, maxRetries: 0, interpolation: { escapeValue: false } });
    return instance;
  }

  it('is shown first, and the whole language merged in after it', async () => {
    let wholeAsked = 0;
    let arrive: (wording: typeof en) => void = () => undefined;
    const coming = new Promise<typeof en>((resolve) => {
      arrive = resolve;
    });
    const instance = await started(
      {
        en: async () => {
          wholeAsked += 1;
          return coming;
        },
        fr: async () => Promise.resolve(fr),
      },
      () => Promise.resolve({ app: { loading: 'First' } }),
    );
    expect(instance.t('app.loading')).toBe('First');
    expect(instance.exists('app.nav.home')).toBe(false);
    expect(wholeAsked).toBe(1);
    arrive(en);
    await vi.waitFor(() => {
      expect(instance.t('app.nav.home')).toBe(en.app.nav.home);
    });
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });

  it('keeps the first screen on its words when the whole language does not come', async () => {
    const instance = await started(
      { en: async () => Promise.reject(new Error('offline')), fr: async () => Promise.resolve(fr) },
      () => Promise.resolve({ app: { loading: 'First' } }),
    );
    await Promise.resolve();
    expect(instance.t('app.loading')).toBe('First');
  });

  it("merges the whole language into the console's i18next by default", async () => {
    const backend = wordingBackend(
      { en: async () => Promise.resolve(en), fr: async () => Promise.resolve(fr) },
      () => Promise.resolve({ app: { loading: 'First' } }),
    );
    const [error, wording] = await read(backend, 'fr');
    expect(error).toBeNull();
    expect(wording).toEqual({ app: { loading: 'First' } });
    await vi.waitFor(() => {
      expect(i18n.getResource('fr', 'translation', 'app.nav.home')).toBe(fr.app.nav.home);
    });
  });

  it('gives way to the whole language when it did not come, or was not fetched', async () => {
    for (const first of [() => Promise.resolve(undefined), () => undefined]) {
      const instance = await started(
        { en: async () => Promise.resolve(en), fr: async () => Promise.resolve(fr) },
        first,
      );
      expect(instance.t('app.nav.home')).toBe(en.app.nav.home);
    }
  });
});

/** The browser's languages, as the person sets them. */
function browserLanguages(languages: readonly string[]): void {
  Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
}

describe('a change of the browser language', () => {
  afterEach(async () => {
    browserLanguages(['en-US']);
    await i18n.changeLanguage('en');
  });

  it('is followed, with the new wording loaded first', async () => {
    const shown = new Promise((resolve) => {
      i18n.on('languageChanged', resolve);
    });
    browserLanguages(['fr-BE', 'en']);
    window.dispatchEvent(new Event('languagechange'));
    expect(await shown).toBe('fr');
    expect(i18n.t('app.loading')).toBe(fr.app.loading);
  });

  it('to the language already shown changes nothing', () => {
    const changed = vi.fn();
    i18n.on('languageChanged', changed);
    browserLanguages(['en-GB']);
    window.dispatchEvent(new Event('languagechange'));
    i18n.off('languageChanged', changed);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('a wording that never comes', () => {
  /** A console whose French chunk never comes, started in `language`, without retries. */
  async function offlineFrench(language: string): Promise<typeof i18next> {
    const instance = i18next.createInstance();
    const offline = async (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    await instance
      .use(wordingBackend({ en: async () => Promise.resolve(en), fr: offline }))
      .init({ lng: language, fallbackLng: false, maxRetries: 0, interpolation: { escapeValue: false } });
    return instance;
  }

  it('gives way to English at start', async () => {
    const instance = await offlineFrench('fr');
    await englishIfMissing(instance);
    expect(instance.language).toBe('en');
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });

  it('leaves a language whose wording came as it is', async () => {
    const instance = await offlineFrench('en');
    await englishIfMissing(instance);
    expect(instance.language).toBe('en');
  });

  it('keeps the screen on the words it has, when chosen later', async () => {
    const instance = await offlineFrench('en');
    expect(await showLanguage('fr', instance)).toBe(false);
    expect(instance.language).toBe('en');
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });

  it('is asked for anew the next time, and shows once it comes', async () => {
    let tries = 0;
    const instance = i18next.createInstance();
    await instance
      .use(
        wordingBackend({
          en: async () => Promise.resolve(en),
          fr: async () => {
            tries += 1;
            return tries === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(fr);
          },
        }),
      )
      .init({ lng: 'en', fallbackLng: false, maxRetries: 0, interpolation: { escapeValue: false } });
    expect(await showLanguage('fr', instance)).toBe(false);
    expect(await showLanguage('fr', instance)).toBe(true);
    expect(instance.t('app.loading')).toBe(fr.app.loading);
  });
});

describe('a change overtaken by a newer one', () => {
  it('does not show its language once its wording comes', async () => {
    const instance = await startedInEnglish();
    expect(await showLanguage('fr', instance, () => false)).toBe(false);
    expect(instance.language).toBe('en');
  });
});

/** A console started in English, every wording at hand. */
async function startedInEnglish(): Promise<typeof i18next> {
  const instance = i18next.createInstance();
  await instance
    .use(wordingBackend({ en: async () => Promise.resolve(en), fr: async () => Promise.resolve(fr) }))
    .init({ lng: 'en', fallbackLng: false, interpolation: { escapeValue: false } });
  return instance;
}
