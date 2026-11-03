// SPDX-License-Identifier: AGPL-3.0-only
// The console downloads the wording of the language it shows, and only that one (src/shared/i18n/i18n.ts): a French
// browser reads French from the first words on the screen, without the English chunk, and a change of the browser's
// language brings the other wording then, before the screen shows it.
import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { ownerOfNewOrganization } from './real';

/** The skip link of every signed-in screen (app.skipToContent), in each language. */
const SKIP = { en: 'Skip to content', fr: 'Aller au contenu' } as const;
/** Words of the English wording that a French screen never shows: the skip link, and the loading state. */
const ENGLISH = [SKIP.en, 'Loading'] as const;

/** Where the page keeps its first words (the script below). */
const FIRST_WORDS = '__ostromFirstWords';

/**
 * Notes the console's first words and the document's language at the very mutation that put them on the screen, so a
 * text that a later render changes is still caught. Added before the page's own scripts run (an init script).
 */
const watchFirstWords = `(() => {
  let first;
  new MutationObserver((_, observer) => {
    const text = document.getElementById('root')?.textContent ?? '';
    if (text.trim() === '') return;
    first = { text, lang: document.documentElement.lang };
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true, characterData: true });
  Object.defineProperty(globalThis, ${JSON.stringify(FIRST_WORDS)}, { get: () => first });
})();`;

const zFirstWords = z.object({ text: z.string(), lang: z.string() });

/** The wording chunks the page fetched so far, by language (Vite names each chunk after its module). */
async function wordingsFetched(page: Page): Promise<string[]> {
  const scripts = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname),
  );
  return scripts.flatMap((path) => /\/assets\/(en|fr)-[\w-]+\.js$/.exec(path)?.[1] ?? []).sort();
}

/** The browser's languages from the next page on, as the person set them (the journeys sign in in English). */
async function browserIn(page: Page, languages: readonly string[]): Promise<void> {
  await page.addInitScript((set) => {
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => set });
  }, languages);
}

test.describe('a French browser', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'the line is slowed through the DevTools protocol',
  );

  test('reads French from the first words, and downloads English only once the browser asks for it', async ({
    page,
  }) => {
    await ownerOfNewOrganization(page, 'ada');
    await browserIn(page, ['fr-FR', 'fr']);
    await page.addInitScript(watchFirstWords);
    // A slow line (Lighthouse's slow 4G, as firstPaint.spec.ts), so the order of the downloads below means something.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await page.goto('/yes');
    const skip = page.locator('a.o-skip');
    await expect(skip).toHaveText(SKIP.fr);

    const first = zFirstWords.parse(
      await page.evaluate((key): unknown => Reflect.get(globalThis, key), FIRST_WORDS),
    );
    expect(first.lang, 'the document says French from the first words').toBe('fr');
    for (const word of ENGLISH) expect(first.text, 'no English before French').not.toContain(word);
    expect(await wordingsFetched(page), 'only the French wording').toEqual(['fr']);
    // `/language.js` asks for the wording while the entry still downloads: no second round trip after it.
    const entry = await page.locator('script[type="module"]').getAttribute('src');
    const timing = await page.evaluate(
      (entryPath) =>
        performance.getEntriesByType('resource').flatMap((one) => {
          const { pathname } = new URL(one.name);
          if (pathname === entryPath) return [{ what: 'entry', at: one.startTime + one.duration }]; // its response's end
          return /\/assets\/fr-[\w-]+\.js$/.test(pathname) ? [{ what: 'wording', at: one.startTime }] : [];
        }),
      entry,
    );
    const at = (what: string): number => timing.find((one) => one.what === what)?.at ?? Number.NaN;
    expect(at('wording'), 'the wording asked for before the entry is in').toBeLessThan(at('entry'));
    await cdp.detach();

    // The person switches the browser to English: the console follows, with the wording it fetches now.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', { configurable: true, get: () => ['en-GB', 'en'] });
    });
    // Fired on the document, it bubbles up to the window, where the browser fires it.
    await page.locator('html').dispatchEvent('languagechange');
    await expect(skip).toHaveText(SKIP.en);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await wordingsFetched(page), 'English fetched on demand').toEqual(['en', 'fr']);
  });
});

test.describe('an English browser', () => {
  test('reads English, without the French wording', async ({ page }) => {
    await ownerOfNewOrganization(page, 'grace');
    await page.goto('/yes');
    await expect(page.locator('a.o-skip')).toHaveText(SKIP.en);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await wordingsFetched(page), 'only the English wording').toEqual(['en']);
  });
});
