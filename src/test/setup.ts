import '@testing-library/jest-dom/vitest';

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
