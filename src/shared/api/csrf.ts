// SPDX-License-Identifier: AGPL-3.0-only

/** The readable cookie the server sets with the session; its value goes back in `X-CSRF-Token`. */
export const CSRF_COOKIE = 'ostrom_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The CSRF token in a `document.cookie` string, if the server set one. */
export function csrfToken(cookies: string): string | undefined {
  for (const pair of cookies.split(';')) {
    const [name, ...value] = pair.trim().split('=');
    if (name === CSRF_COOKIE) {
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

/** A call that changes something carries the CSRF token next to the session cookie (audit S2-08, 30/10 06:00). */
export function withCsrf(request: Request, cookies: string): Request {
  const token = csrfToken(cookies);
  if (token === undefined || SAFE_METHODS.has(request.method.toUpperCase())) return request;
  request.headers.set(CSRF_HEADER, token);
  return request;
}
