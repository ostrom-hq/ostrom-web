// SPDX-License-Identifier: AGPL-3.0-only
import {
  BOOT_WINDOW_MS,
  BOOTED,
  type BootRoute,
  bootScript,
  ORG_CHOICE_KEY,
} from '@/shared/build/bootScript';
import { patternOf } from '@/shared/build/routes';
import { ORG_STORAGE_KEY } from '@/shared/org/orgStore';

const ROUTES: readonly BootRoute[] = [
  {
    pattern: patternOf('/yes'),
    chunks: [],
    styles: [],
    calls: [
      { path: '/api/v1/auth/me', org: 'none' },
      { path: '/api/v1/approvals?mine=true', org: 'if-chosen' },
      { path: '/api/v1/auth/me', org: 'chosen' },
    ],
  },
  {
    pattern: patternOf('/rules'),
    chunks: ['/assets/rules-1.js', '/assets/Card-2.js'],
    styles: ['/assets/rules-3.css'],
    calls: [],
  },
];

/** The page's own global, where its inline scripts run: what the script reads and leaves is read and set there. */
function page(): object {
  const view = document.defaultView;
  if (view === null) throw new Error('no window for the document');
  return view;
}

const OWN = ['fetch', 'setTimeout', BOOTED] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  for (const name of OWN) saved.set(name, Reflect.getOwnPropertyDescriptor(page(), name));
});

afterEach(() => {
  for (const name of OWN) {
    const descriptor = saved.get(name);
    if (descriptor === undefined) Reflect.deleteProperty(page(), name);
    else Reflect.defineProperty(page(), name, descriptor);
  }
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

interface Booted {
  readonly preloaded: string[];
  /** The stylesheets preloaded, never applied before the console links them. */
  readonly styled: string[];
  readonly asked: [string, RequestInit | undefined][];
  readonly store: unknown;
  /** The timers the script set to drop what was not taken up, and after how long. */
  readonly timers: [() => void, number][];
}

/** Runs the script as the browser does on `path`, and says what it preloaded, which reads it started, its timers. */
function bootOn(path: string): Booted {
  window.history.replaceState(null, '', path);
  document.head.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]').forEach((link) => {
    link.remove();
  });
  const asked: [string, RequestInit | undefined][] = [];
  const timers: [() => void, number][] = [];
  Reflect.set(page(), 'fetch', async (input: string, init?: RequestInit) => {
    asked.push([input, init]);
    if (input.includes('approvals')) throw new Error('offline');
    return Promise.resolve(new Response('{}'));
  });
  Reflect.set(page(), 'setTimeout', (run: () => void, delay: number) => {
    timers.push([run, delay]);
    return timers.length;
  });
  // The build writes it as a file; here it runs as an inline script of the page (jsdom runs them in the test).
  const script = document.createElement('script');
  script.textContent = bootScript(ROUTES, { storageKey: ORG_STORAGE_KEY, store: BOOTED });
  document.head.append(script);
  script.remove();
  const preloaded = [...document.head.querySelectorAll('link[rel="modulepreload"]')].map(
    (link) => link.getAttribute('href') ?? '',
  );
  const styled = [...document.head.querySelectorAll('link[rel="preload"][as="style"]')].map(
    (link) => link.getAttribute('href') ?? '',
  );
  expect(document.head.querySelector('link[rel="stylesheet"][href^="/assets/rules"]')).toBeNull();
  return { preloaded, styled, asked, store: Reflect.get(page(), BOOTED), timers };
}

/** Each key of the store, with whether its value is a pending read (a promise). */
function entriesOf(store: unknown): [string, boolean][] {
  if (typeof store !== 'object' || store === null) return [];
  return Object.keys(store).map((key) => {
    const value: unknown = Reflect.get(store, key);
    return [key, value instanceof Promise];
  });
}

describe('the boot script', () => {
  it('reads the organization where the console keeps it', () => {
    expect(ORG_CHOICE_KEY).toBe(ORG_STORAGE_KEY);
  });

  it('preloads the chunks and stylesheets of the route opened, and starts nothing it has no read for', () => {
    const { preloaded, styled, asked, store } = bootOn('/rules');
    expect(preloaded).toEqual(['/assets/rules-1.js', '/assets/Card-2.js']);
    expect(styled).toEqual(['/assets/rules-3.css']);
    expect(asked).toEqual([]);
    expect(store).toEqual({});
  });

  it('starts the reads in the organization chosen and kept, each left by its key', () => {
    window.localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify({ id: 'org-1', login: 'maya' }));
    const { asked, store } = bootOn('/yes');
    expect(
      asked.map(([path, init]) => [path, init?.credentials, new Headers(init?.headers).get('Ostrom-Org')]),
    ).toEqual([
      ['/api/v1/auth/me', 'include', null],
      ['/api/v1/approvals?mine=true', 'include', 'org-1'],
      ['/api/v1/auth/me', 'include', 'org-1'],
    ]);
    expect(entriesOf(store)).toEqual([
      ['GET /api/v1/auth/me ', true],
      ['GET /api/v1/approvals?mine=true org-1', true],
      ['GET /api/v1/auth/me org-1', true],
    ]);
  });

  it('names no organization without a valid one kept, and skips what needs one', () => {
    for (const stored of [
      'not json',
      JSON.stringify({ id: 'bad id', login: 'maya' }),
      JSON.stringify(null),
    ]) {
      window.localStorage.setItem(ORG_STORAGE_KEY, stored);
      const { asked, store } = bootOn('/yes');
      expect(asked.map(([path, init]) => [path, new Headers(init?.headers).get('Ostrom-Org')])).toEqual([
        ['/api/v1/auth/me', null],
        ['/api/v1/approvals?mine=true', null],
      ]);
      expect(entriesOf(store)).toEqual([
        ['GET /api/v1/auth/me ', true],
        ['GET /api/v1/approvals?mine=true ', true],
      ]);
    }
  });

  it('drops what the console has not taken up once the first screen is long past, and only its own store', () => {
    const first = bootOn('/yes');
    expect(first.timers.map(([, delay]) => delay)).toEqual([BOOT_WINDOW_MS]);
    for (const [run] of first.timers) run();
    expect(Reflect.get(page(), BOOTED)).toBeUndefined();

    const second = bootOn('/yes');
    const newer = {};
    Reflect.set(page(), BOOTED, newer);
    for (const [run] of second.timers) run();
    expect(Reflect.get(page(), BOOTED)).toBe(newer);
  });

  it('does nothing on a route it does not know', () => {
    const { preloaded, styled, asked, store, timers } = bootOn('/signin');
    expect(preloaded).toEqual([]);
    expect(styled).toEqual([]);
    expect(asked).toEqual([]);
    expect(store).toBeUndefined();
    expect(timers).toEqual([]);
  });
});
