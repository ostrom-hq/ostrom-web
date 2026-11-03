// SPDX-License-Identifier: AGPL-3.0-only
import { pickLanguage } from '@/shared/i18n/i18n';
import { languageScript } from '@/shared/i18n/languageScript';
import { LANGUAGES } from '@/shared/i18n/types';

const CHUNKS = { en: '/assets/en-1.js', fr: '/assets/fr-2.js' } as const;

/** Runs the script as the browser does, with `languages` as the browser's, and says which chunk it preloaded. */
function preloadedWith(languages: readonly string[] | undefined): string | null {
  Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
  document.head.querySelectorAll('link[rel="modulepreload"]').forEach((link) => {
    link.remove();
  });
  // The build writes it as a file; here it runs as an inline script of the page (jsdom runs them in the test).
  const script = document.createElement('script');
  script.textContent = languageScript(CHUNKS, LANGUAGES);
  document.head.append(script);
  script.remove();
  return document.head.querySelector('link[rel="modulepreload"]')?.getAttribute('href') ?? null;
}

describe('the language preload', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] });
  });

  it.each([[['fr-FR', 'en']], [['de-DE', 'fr-CA']], [['en-GB', 'fr']], [['de']], [[]], [['FR']]])(
    'preloads the wording pickLanguage shows for %j',
    (languages) => {
      expect(preloadedWith(languages)).toBe(CHUNKS[pickLanguage(languages)]);
    },
  );

  it('preloads English for a browser that lists no language', () => {
    expect(preloadedWith(undefined)).toBe(CHUNKS.en);
  });

  it('fails the build when a language has no chunk', () => {
    expect(() => languageScript({ en: CHUNKS.en }, LANGUAGES)).toThrow('no wording chunk for fr');
  });
});
