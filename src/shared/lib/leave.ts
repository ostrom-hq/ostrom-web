// SPDX-License-Identifier: AGPL-3.0-only

/** The browser's way out to another site; the tests replace it, since a test page cannot leave. */
export const exit = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/**
 * Sends the browser to a page the server named (Stripe's checkout or portal), only over https: an address that
 * is not one stays unvisited, and the caller says so.
 */
export function leaveFor(url: string): boolean {
  let protocol: string;
  try {
    ({ protocol } = new URL(url));
  } catch {
    return false;
  }
  if (protocol !== 'https:') return false;
  exit.assign(url);
  return true;
}
