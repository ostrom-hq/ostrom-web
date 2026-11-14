import {
  englishIfMissing,
  i18n,
  i18nReady,
  pickLanguage,
  showLanguage,
  wordingLoader,
} from '@/shared/i18n/i18n';
import { createI18n, type I18n } from '@/shared/i18n/instance';
import { en } from '@/shared/i18n/locales/en';
import { fr } from '@/shared/i18n/locales/fr';

// First: the start is read before any other test changes the language.
describe('the start', () => {
  it('loads the language of the browser, and nothing else', async () => {
    await i18nReady;
    expect(i18n.language).toBe('en');
    expect(i18n.t('app.loading')).toBe(en.app.loading);
    expect(i18n.hasResourceBundle('fr')).toBe(false);
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
  it('follows the language shown', () => {
    expect(document.documentElement.lang).toBe('en');
    i18n.changeLanguage('fr');
    expect(document.documentElement.lang).toBe('fr');
    i18n.changeLanguage('en');
  });
});

type Wordings = Parameters<typeof wordingLoader>[1];
type First = Parameters<typeof wordingLoader>[2];

const bothLanguages: Wordings = { en: async () => Promise.resolve(en), fr: async () => Promise.resolve(fr) };

describe('loading only the language shown', () => {
  it('loads the other language when it is chosen, before showing it', async () => {
    expect(await showLanguage('fr')).toBe(true);
    expect(i18n.t('app.loading')).toBe(fr.app.loading);
    i18n.changeLanguage('en');
  });

  it('reads a language from its own chunk', async () => {
    const instance = createI18n();
    expect(await wordingLoader(instance)('fr')).toBe(true);
    expect(instance.getResource('fr', 'app.nav.home')).toBe(fr.app.nav.home);
    expect(instance.hasResourceBundle('en')).toBe(false);
  });

  it('has no wording for a language the console does not speak', async () => {
    const instance = createI18n();
    expect(await wordingLoader(instance)('de')).toBe(false);
    expect(instance.hasResourceBundle('de')).toBe(false);
  });

  it('asks again, after 350 ms then 700 ms, when a chunk does not come, then gives up', async () => {
    vi.useFakeTimers();
    try {
      let tries = 0;
      const instance = createI18n();
      const load = wordingLoader(instance, {
        en: async () => {
          tries += 1;
          return Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
        },
        fr: async () => Promise.resolve(fr),
      });
      const loaded = load('en');
      await vi.advanceTimersByTimeAsync(349);
      expect(tries).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(tries).toBe(2);
      await vi.advanceTimersByTimeAsync(699);
      expect(tries).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(tries).toBe(3);
      expect(await loaded).toBe(false);
      expect(instance.hasResourceBundle('en')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows what a retry brings', async () => {
    let tries = 0;
    const instance = createI18n();
    const load = wordingLoader(
      instance,
      {
        en: async () => {
          tries += 1;
          return tries === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(en);
        },
        fr: async () => Promise.resolve(fr),
      },
      () => undefined,
      [0],
    );
    expect(await load('en')).toBe(true);
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });
});

describe("the first screen's own wording", () => {
  /** A console started on these wordings, as it starts: the first screen's words, the whole language after. */
  async function started(wordings: Wordings, first: First, retries: readonly number[] = []): Promise<I18n> {
    const instance = createI18n();
    await wordingLoader(instance, wordings, first, retries)('en');
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
      async () => Promise.resolve({ app: { loading: 'First' } }),
    );
    expect(instance.t('app.loading')).toBe('First');
    expect(instance.t('app.nav.home')).toBe('app.nav.home');
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
      async () => Promise.resolve({ app: { loading: 'First' } }),
    );
    await Promise.resolve();
    expect(instance.t('app.loading')).toBe('First');
  });

  it('reads the whole language when /boot.js fetched none of it (the default)', async () => {
    const instance = createI18n();
    expect(await wordingLoader(instance, bothLanguages)('fr')).toBe(true);
    expect(instance.t('app.nav.home')).toBe('app.nav.home');
    expect(instance.getFixedT('fr')('app.nav.home')).toBe(fr.app.nav.home);
  });

  it('asks the rest of the language again when it does not come the first time', async () => {
    let tries = 0;
    const instance = await started(
      {
        en: async () => {
          tries += 1;
          return tries === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(en);
        },
        fr: async () => Promise.resolve(fr),
      },
      async () => Promise.resolve({ app: { loading: 'First' } }),
      [0],
    );
    await vi.waitFor(() => {
      expect(instance.t('app.nav.home')).toBe(en.app.nav.home);
    });
  });

  it('gives way to the whole language when it did not come, or was not fetched', async () => {
    for (const first of [async () => Promise.resolve(undefined), () => undefined]) {
      const instance = await started(bothLanguages, first);
      expect(instance.t('app.nav.home')).toBe(en.app.nav.home);
    }
  });
});

/** The browser's languages, as the person sets them. */
function browserLanguages(languages: readonly string[]): void {
  Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
}

describe('a change of the browser language', () => {
  afterEach(() => {
    browserLanguages(['en-US']);
    i18n.changeLanguage('en');
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
  /** A console whose French chunk never comes, started in `language`. */
  async function offlineFrench(
    language: string,
  ): Promise<{ instance: I18n; load: (l: string) => Promise<boolean> }> {
    const instance = createI18n(language);
    const offline = async (): Promise<never> => Promise.reject(new TypeError('Failed to fetch'));
    const load = wordingLoader(
      instance,
      { en: async () => Promise.resolve(en), fr: offline },
      () => undefined,
      [],
    );
    await load(language);
    return { instance, load };
  }

  it('gives way to English at start', async () => {
    const { instance, load } = await offlineFrench('fr');
    await englishIfMissing(instance, load);
    expect(instance.language).toBe('en');
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });

  it('leaves a language whose wording came as it is', async () => {
    const { instance, load } = await offlineFrench('en');
    await englishIfMissing(instance, load);
    expect(instance.language).toBe('en');
  });

  it('keeps the screen on the words it has, when chosen later', async () => {
    const { instance, load } = await offlineFrench('en');
    expect(await showLanguage('fr', instance, () => true, load)).toBe(false);
    expect(instance.language).toBe('en');
    expect(instance.t('app.loading')).toBe(en.app.loading);
  });

  it('is asked for anew the next time, and shows once it comes', async () => {
    let tries = 0;
    const instance = createI18n();
    const load = wordingLoader(
      instance,
      {
        en: async () => Promise.resolve(en),
        fr: async () => {
          tries += 1;
          return tries === 1 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(fr);
        },
      },
      () => undefined,
      [],
    );
    expect(await showLanguage('fr', instance, () => true, load)).toBe(false);
    expect(await showLanguage('fr', instance, () => true, load)).toBe(true);
    expect(instance.t('app.loading')).toBe(fr.app.loading);
  });
});

describe('a language for an instance of its own', () => {
  it('is loaded into that instance, not into the console', async () => {
    const instance = createI18n();
    expect(await showLanguage('en', instance)).toBe(true);
    expect(instance.hasResourceBundle('en')).toBe(true);
    await englishIfMissing(createI18n('fr'));
  });
});

describe('a change overtaken by a newer one', () => {
  it('does not show its language once its wording comes', async () => {
    const instance = createI18n();
    const load = wordingLoader(instance, bothLanguages, () => undefined);
    expect(await showLanguage('fr', instance, () => false, load)).toBe(false);
    expect(instance.language).toBe('en');
  });
});
