// SPDX-License-Identifier: AGPL-3.0-only
// No import: vite.config.ts reads this file too, without the app's `@` alias.
/**
 * `/boot.js` of a build with the mock API (vite.config.ts, `preloadBoot`; src/shared/build/bootScript.ts otherwise,
 * which picks the language the same way): it picks the person's
 * language as `pickLanguage` does and preloads that wording's chunk, so it downloads alongside the entry instead of
 * after it. `chunks` is the URL of each language's chunk; one of `languages` without one fails the build, as the script
 * would then preload English for it, and the console fetch its own wording too.
 */
export function languageScript(
  chunks: Readonly<Record<string, string>>,
  languages: readonly string[],
): string {
  const missing = languages.filter((language) => chunks[language] === undefined);
  if (missing.length > 0) throw new Error(`no wording chunk for ${missing.join(', ')}`);
  return `// SPDX-License-Identifier: AGPL-3.0-only
// Written by the build (src/shared/i18n/languageScript.ts): fetches the wording of the person's language with the entry.
(function () {
  var chunks = ${JSON.stringify(chunks)};
  var picked = 'en';
  var languages = navigator.languages || [];
  for (var i = 0; i < languages.length; i += 1) {
    var base = String(languages[i]).toLowerCase().split('-')[0];
    if (Object.prototype.hasOwnProperty.call(chunks, base)) {
      picked = base;
      break;
    }
  }
  var link = document.createElement('link');
  link.rel = 'modulepreload';
  // Before the screen's own files: the console renders nothing without its wording.
  link.setAttribute('fetchpriority', 'high');
  link.href = chunks[picked];
  document.head.appendChild(link);
})();
`;
}
