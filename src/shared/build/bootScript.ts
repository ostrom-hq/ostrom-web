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
  readonly calls: readonly BootCall[];
}

export interface BootOptions {
  /** Where the console keeps the organization the person chose (src/shared/org/orgStore.ts, `ORG_STORAGE_KEY`). */
  readonly storageKey: string;
  /** Where the responses are left for the console (src/shared/api/bootFetch.ts, `BOOTED`). */
  readonly store: string;
}

/**
 * The source of `/boot.js`, which the build writes (vite.config.ts, `preloadBoot`) and the page's head loads before
 * the entry: for the route opened, it preloads the screen's chunks (`modulepreload`) and stylesheets, and starts the API reads the first
 * paint waits for, so that both come alongside the entry instead of after it has run. Each response is left by its key
 * (method, address, organization) for the console's `fetch` to take up once (src/shared/api/bootFetch.ts): a read is
 * never made twice. A read in an organization is made in the one the person chose and kept (BootCall says how); the
 * console's own read in another organization then goes out as usual. What is not taken up within BOOT_WINDOW_MS
 * is dropped: a later read always goes out.
 */
export function bootScript(routes: readonly BootRoute[], options: BootOptions): string {
  return `// SPDX-License-Identifier: AGPL-3.0-only
// Written by the build (src/shared/build/bootScript.ts): the screen's chunks and first reads, with the entry.
(function () {
  var routes = ${JSON.stringify(routes)};
  var path = location.pathname;
  var route = null;
  for (var i = 0; i < routes.length; i += 1) {
    if (new RegExp(routes[i].pattern).test(path)) {
      route = routes[i];
      break;
    }
  }
  if (route === null) return;
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
  var booted = {};
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
