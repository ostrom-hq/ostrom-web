// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The readable cookies the server sets with the session; the value goes back in `X-CSRF-Token` (double submit).
 * Over HTTPS the cookie is `__Host-` prefixed (Secure, no Domain, Path=/); in plain-HTTP development it is not.
 * The page reads it, so the API is served from the console's own origin (the console image proxies `/api/v1`).
 */
export const CSRF_COOKIES = ['__Host-ostrom_csrf', 'ostrom_csrf'] as const;
export const CSRF_HEADER = 'X-CSRF-Token';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

function cookieValue(cookies: string, wanted: string): string | undefined {
  for (const pair of cookies.split(';')) {
    const [name, ...value] = pair.trim().split('=');
    if (name === wanted) {
      const token = value.join('=');
      if (token === '') return undefined;
      // A badly encoded value is sent as it is: the server refuses it, the console does not crash.
      try {
        return decodeURIComponent(token);
      } catch {
        return token;
      }
    }
  }
  return undefined;
}

/** The CSRF token in a `document.cookie` string: the `__Host-` cookie first, the development one after. */
export function csrfToken(cookies: string): string | undefined {
  for (const name of CSRF_COOKIES) {
    const token = cookieValue(cookies, name);
    if (token !== undefined) return token;
  }
  return undefined;
}

/** A call that changes something carries the CSRF token next to the session cookie (audit S2-08, 30/10 06:00). */
export function withCsrf(request: Request, cookies: string): Request {
  const token = csrfToken(cookies);
  if (token === undefined || SAFE_METHODS.has(request.method.toUpperCase())) return request;
  request.headers.set(CSRF_HEADER, token);
  return request;
}
