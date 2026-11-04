// SPDX-License-Identifier: AGPL-3.0-only
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/** Where `/boot.js` leaves the responses for the console's `fetch` (src/shared/api/bootFetch.ts). */
export const BOOTED = '__ostromBooted';

/** Where the console keeps the organization the person chose (src/shared/org/orgStore.ts, `ORG_STORAGE_KEY`). */
export const ORG_CHOICE_KEY = 'ostrom.org.choice';

/** How long the reads `/boot.js` started wait for the console to take them up, from the page's head. */
export const BOOT_WINDOW_MS = 30_000;

/**
 * An API read `/boot.js` starts, and in which organization, as the console would ask it at its start: `none` names
 * none; `if-chosen` names the one the person chose and kept, if any (src/shared/org/orgStore.ts starts from it; a
 * person with one organization keeps none); `chosen` is only made with one kept.
 */
export interface BootCall {
  readonly path: string;
  readonly org: 'none' | 'if-chosen' | 'chosen';
}

/** What `/boot.js` starts for one route of the router: its screen's chunks, and the reads its first paint waits for. */
export interface BootRoute {
  /** A regular expression's source that matches the whole pathname (src/shared/build/routes.ts, `patternOf`). */
  readonly pattern: string;
  readonly chunks: readonly string[];
  /** Its screen's stylesheets: the console waits for them before it shows the screen. */
  readonly styles: readonly string[];
  /**
   * By language, the address of the wording its first screen shows (the sections its chunks and the first download
   * name): a few KB fetched in place of the whole language, which the console loads once the screen is up.
   */
  readonly wordings: Readonly<Record<string, string>>;
  readonly calls: readonly BootCall[];
}

/** The key under which `/boot.js` leaves the first screen's wording of `language` (src/shared/i18n/firstWording.ts). */
export function wordingKey(language: string): string {
  return `WORDING ${language}`;
}

export interface BootOptions {
  /** By language, the address of its whole wording's chunk, preloaded when the route has no wording of its own. */
  readonly languages: Readonly<Record<string, string>>;
  /** Where the console keeps the organization the person chose (src/shared/org/orgStore.ts, `ORG_STORAGE_KEY`). */
  readonly storageKey: string;
  /** Where the responses are left for the console (src/shared/api/bootFetch.ts, `BOOTED`). */
  readonly store: string;
}

/**
 * The source of `/boot.js`, which the build writes (vite.config.ts, `preloadBoot`) and the page's head loads before
 * the entry. It picks the language as the console does and starts its wording first: the route's own (only what its
 * first screen shows, left under `wordingKey` for src/shared/i18n/firstWording.ts), else the whole language's chunk.
 * For the route opened, it preloads the screen's chunks (`modulepreload`) and stylesheets, and starts the API reads the first
 * paint waits for, so that both come alongside the entry instead of after it has run. Each response is left by its key
 * (method, address, organization) for the console's `fetch` to take up once (src/shared/api/bootFetch.ts): a read is
 * never made twice. A read in an organization is made in the one the person chose and kept (BootCall says how); the
 * console's own read in another organization then goes out as usual. What is not taken up within BOOT_WINDOW_MS
 * is dropped: a later read always goes out.
 */
export function bootScript(routes: readonly BootRoute[], options: BootOptions): string {
  return `// SPDX-License-Identifier: AGPL-3.0-only
// Written by the build (src/shared/build/bootScript.ts): the wording, the screen's chunks and first reads, with the entry.
(function () {
  var routes = ${JSON.stringify(routes)};
  var languages = ${JSON.stringify(options.languages)};
  // The language shown, as src/shared/i18n/i18n.ts picks it (pickLanguage).
  var picked = 'en';
  var preferred = navigator.languages || [];
  for (var l = 0; l < preferred.length; l += 1) {
    var base = String(preferred[l]).toLowerCase().split('-')[0];
    if (Object.prototype.hasOwnProperty.call(languages, base)) {
      picked = base;
      break;
    }
  }
  var path = location.pathname;
  var route = null;
  for (var i = 0; i < routes.length; i += 1) {
    if (new RegExp(routes[i].pattern).test(path)) {
      route = routes[i];
      break;
    }
  }
  var wording = route === null ? undefined : route.wordings[picked];
  if (wording === undefined) {
    // The whole wording, first of all: the console renders nothing without it.
    var whole = document.createElement('link');
    whole.rel = 'modulepreload';
    whole.setAttribute('fetchpriority', 'high');
    whole.href = languages[picked];
    document.head.appendChild(whole);
  }
  if (route === null) return;
  var booted = {};
  if (wording !== undefined) {
    // Only what the first screen shows, first of all; the console loads the rest once the screen is up.
    var words = fetch(wording, { credentials: 'same-origin', priority: 'high' });
    words.catch(function () {});
    booted[${JSON.stringify(wordingKey(''))} + picked] = words;
  }
  for (var j = 0; j < route.chunks.length; j += 1) {
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = route.chunks[j];
    document.head.appendChild(link);
  }
  // Preloaded, not applied: the console links each one as it opens the screen, and finds it already in.
  for (var s = 0; s < route.styles.length; s += 1) {
    var style = document.createElement('link');
    style.rel = 'preload';
    style.setAttribute('as', 'style');
    // As the console links it (crossorigin, Vite's preload): another mode would download it a second time.
    style.setAttribute('crossorigin', '');
    style.href = route.styles[s];
    document.head.appendChild(style);
  }
  var org = '';
  try {
    var stored = JSON.parse(localStorage.getItem(${JSON.stringify(options.storageKey)}) || 'null');
    if (stored && typeof stored.id === 'string' && /^[\\x21-\\x7E]{1,200}$/.test(stored.id)) org = stored.id;
  } catch (error) {
    org = '';
  }
  for (var k = 0; k < route.calls.length; k += 1) {
    var call = route.calls[k];
    if (call.org === 'chosen' && org === '') continue;
    var named = call.org === 'none' ? '' : org;
    var headers = { accept: 'application/json' };
    if (named !== '') headers['Ostrom-Org'] = named;
    var asked = fetch(call.path, { credentials: 'include', headers: headers });
    // Taken up by the console, which reads its failure; never an unhandled rejection meanwhile.
    asked.catch(function () {});
    booted['GET ' + call.path + ' ' + named] = asked;
  }
  window[${JSON.stringify(options.store)}] = booted;
  // Only for the first screen: a read the console has not taken up by then would answer a later one with old data.
  setTimeout(function () {
    if (window[${JSON.stringify(options.store)}] === booted) delete window[${JSON.stringify(options.store)}];
  }, ${String(BOOT_WINDOW_MS)});
})();
`;
}
