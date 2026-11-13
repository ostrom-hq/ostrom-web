// SPDX-License-Identifier: Apache-2.0

/** The browser's way out to another site; the tests replace it, since a test page cannot leave. */
export const exit = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/** The machine itself: a page there is the person's own (an instance run locally, a journey's fake provider). */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface LeaveOptions {
  /** Also a plain http page on the machine itself: a sign-in provider's consent page named by a local instance. */
  readonly loopback?: boolean;
}

/**
 * Sends the browser to a page the server named (Stripe's checkout or portal, a provider's consent page), only over
 * https, or on the machine itself when the caller allows it: an address that is neither stays unvisited, and the
 * caller says so.
 */
export function leaveFor(url: string, options: LeaveOptions = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const local = options.loopback === true && parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) return false;
  exit.assign(url);
  return true;
}
