// SPDX-License-Identifier: AGPL-3.0-only
// No import: vite.config.ts reads this file too, without the app's `@` alias.

/**
 * The sections of the wording (its top-level keys) that `code` names: a key the console reads is a typed literal,
 * `'yes.signin.offer'` or `` `billing.${period}` ``, so a section is named wherever such a literal starts with it.
 * The build reads the code of a screen's chunks with it (vite.config.ts, `preloadBoot`): a word may name a section
 * the screen never shows, which only costs a few bytes; a key never escapes it.
 */
export function sectionsIn(code: string, sections: Iterable<string>): Set<string> {
  const named = new Set<string>();
  for (const section of sections)
    if (!/^[A-Za-z]\w*$/.test(section)) throw new Error(`a section of the wording is not a name: ${section}`);
    else if (new RegExp(`["'\`]${section}\\.[A-Za-z]`).test(code)) named.add(section);
  return named;
}

/** Only the sections of `wording` that a screen names, in its order, for the JSON `/boot.js` fetches first. */
export function screenWording(
  wording: Readonly<Record<string, unknown>>,
  sections: ReadonlySet<string>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(wording).filter(([section]) => sections.has(section)));
}
