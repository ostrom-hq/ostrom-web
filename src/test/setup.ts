import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

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
