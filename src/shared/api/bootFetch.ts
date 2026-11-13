// SPDX-License-Identifier: Apache-2.0
import { ORG_HEADER } from '@/shared/api/orgHeader';
import { BOOTED } from '@/shared/build/bootScript';

export { BOOTED };

/** A call's key, as `/boot.js` writes it: the method, the address from its path on, and the organization named. */
export function bootKey(method: string, url: string, org: string | null): string {
  const { pathname, search } = new URL(url, 'http://console.invalid');
  return `${method} ${pathname}${search} ${org ?? ''}`;
}

/**
 * The response `/boot.js` already asked for this very call (same method, address and organization), taken out of
 * its store so that it serves once: `undefined` when it did not ask for it. Only reads: a change always goes out.
 */
export function takeBooted(
  request: Request,
  store: unknown = Reflect.get(globalThis, BOOTED),
): Promise<unknown> | undefined {
  if (request.method !== 'GET' || typeof store !== 'object' || store === null) return undefined;
  const key = bootKey(request.method, request.url, request.headers.get(ORG_HEADER));
  const booted: unknown = Reflect.get(store, key);
  if (!(booted instanceof Promise)) return undefined;
  Reflect.deleteProperty(store, key);
  return booted;
}

/**
 * The console's `fetch`: a call `/boot.js` started is taken up instead of made a second time. If it failed, is no
 * response or not a success (signed out, say: the read after signing in must not get that answer), the call goes out
 * as any other does.
 */
export async function bootFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request && init === undefined ? input : new Request(input, init);
  const booted = takeBooted(request);
  if (booted !== undefined) {
    const response: unknown = await booted.catch(() => undefined);
    if (response instanceof Response && response.ok) return response;
  }
  return fetch(request);
}
