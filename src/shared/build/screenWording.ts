// SPDX-License-Identifier: Apache-2.0
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/** Every key path of a section, its segments joined by dots: `title`, `nav.open`, `events.session.started`. */
function keyPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/**
 * Whether the static part of a literal after its section leads into it: the start of a key path of the section, so a
 * whole key, a key built from it (`'billing.' + period`, `` `rules.kind_${kind}` ``) or the stem of a plural or context
 * form (`items` of `items_one`).
 */
function leadsInto(paths: readonly string[], path: string): boolean {
  return paths.some((key) => key.startsWith(path));
}

/** The key paths of each section of a wording, built once per wording: the build reads every chunk against it. */
const indexes = new WeakMap<object, Map<string, readonly string[]>>();

function indexOf(wording: Readonly<Record<string, unknown>>): Map<string, readonly string[]> {
  const known = indexes.get(wording);
  if (known !== undefined) return known;
  const paths = new Map<string, readonly string[]>();
  for (const [section, node] of Object.entries(wording))
    if (!/^[A-Za-z]\w*$/.test(section)) throw new Error(`a section of the wording is not a name: ${section}`);
    else paths.set(section, keyPaths(node));
  indexes.set(wording, paths);
  return paths;
}

/**
 * The sections of the wording (its top-level keys) that `code` names: a key the console reads is a typed literal,
 * `'yes.signin.offer'`, `` `billing.${period}` `` or `'billing.' + period` once minified, so a section is named
 * wherever such a literal starts with it and its static part leads into the section. Another literal of the same shape
 * is not a key and names nothing: a feature the server announces (`'webhooks.v1'`), a host (`'github.com'`).
 * The build reads the code of a screen's chunks with it (vite.config.ts, `preloadBoot`): a word may name a section
 * the screen never shows, which only costs a few bytes; a key never escapes it.
 */
export function sectionsIn(code: string, wording: Readonly<Record<string, unknown>>): Set<string> {
  const paths = indexOf(wording);
  const named = new Set<string>();
  for (const [, section = '', path = ''] of code.matchAll(/["'`]([A-Za-z]\w*)\.([\w.-]*)(?=["'`$])/g)) {
    const keys = paths.get(section);
    if (keys !== undefined && leadsInto(keys, path)) named.add(section);
  }
  return named;
}

/** Only the sections of `wording` that a screen names, in its order, for the JSON `/boot.js` fetches first. */
export function screenWording(
  wording: Readonly<Record<string, unknown>>,
  sections: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(wording).filter(([section]) => sections.has(section)));
}
