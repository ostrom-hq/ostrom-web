import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import type * as Msw from 'msw';
import { held } from '@/test/handlerFetch';
import { i18nReady } from '@/shared/i18n/i18n';

// A shared CI runner under load can take more than a second to render a screen after its first answer: the
// `findBy` queries wait up to four seconds before calling a screen missing.
configure({ asyncUtilTimeout: 4_000 });

// jsdom has no matchMedia; the console reads it for the system theme.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as Partial<MediaQueryList> as MediaQueryList,
});

Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-US'] });

// The wording comes in a chunk of its own (src/shared/i18n/i18n.ts): every test starts with it in, as the console does.
await i18nReady;

// `delay('infinite')` in a mock handler holds it for good: the end of a test does not wait for it (see `endTest`).
vi.mock('msw', async (importOriginal) => {
  const msw = await importOriginal<typeof Msw>();
  return {
    ...msw,
    delay: async (...args: Parameters<typeof msw.delay>): Promise<void> => {
      if (args[0] === 'infinite') await held(msw.delay('infinite'));
      else await msw.delay(...args);
    },
  };
});
