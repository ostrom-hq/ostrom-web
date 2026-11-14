// SPDX-License-Identifier: Apache-2.0
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/** A wording's node as a record of its keys, or undefined for a text. */
function recordOf(node: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
    ? (node as Readonly<Record<string, unknown>>)
    : undefined;
}

/** Whether `segment` is a key of `node`, or the stem of its plural or context forms (`items` of `items_one`). */
function keyOf(node: Readonly<Record<string, unknown>>, segment: string): string | undefined {
  if (segment in node) return segment;
  return Object.keys(node).some((key) => key.startsWith(`${segment}_`)) ? segment : undefined;
}

/** Whether the static path of a literal after its section leads into the wording: every segment is one of its keys. */
function leadsInto(section: unknown, path: string): boolean {
  let node = recordOf(section);
  for (const segment of path.split('.').filter((part) => part !== '')) {
    if (node === undefined || keyOf(node, segment) === undefined) return false;
    node = recordOf(node[segment]);
  }
  return true;
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
  const named = new Set<string>();
  for (const section of Object.keys(wording))
    if (!/^[A-Za-z]\w*$/.test(section)) throw new Error(`a section of the wording is not a name: ${section}`);
  for (const [, section = '', path = ''] of code.matchAll(/["'`]([A-Za-z]\w*)\.([\w.]*)(?=["'`$])/g))
    if (Object.hasOwn(wording, section) && leadsInto(wording[section], path)) named.add(section);
  return named;
}

/** Only the sections of `wording` that a screen names, in its order, for the JSON `/boot.js` fetches first. */
export function screenWording(
  wording: Readonly<Record<string, unknown>>,
  sections: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(wording).filter(([section]) => sections.has(section)));
}
