// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A link that came from an agent or a CI (evidence, checks, commits) is only a link when it is http(s):
 * a `javascript:` or `data:` URL on the page people approve from would run in the signed-in console.
 */
export function safeHref(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}
