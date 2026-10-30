import { client } from '@gen/api/client.gen';
import { toApiFailure } from '@/shared/api/ApiFailure';
import { withCsrf } from '@/shared/api/csrf';

export interface ApiClientConfig {
  /** The origin of the Ostrom API (`''` for the same origin): the contract's paths carry `/api/v1`. */
  readonly baseUrl: string;
}

function typedFailure(error: unknown, response: Response | undefined): Error {
  return toApiFailure(error, response);
}

/** The origin configured last, for the addresses the browser opens itself. */
let apiBase = '';

function csrf(request: Request): Request {
  return withCsrf(request, document.cookie);
}

/**
 * Points the generated client at the server and types every failure. Every call carries the server's `HttpOnly`
 * session cookie (`credentials: 'include'`, audit S2-08), which no script on the page can read, and a call that
 * changes something its CSRF token. The console sends no bearer token: the cookie is the session.
 */
export function configureApiClient({ baseUrl }: ApiClientConfig): void {
  apiBase = baseUrl;
  client.setConfig({ baseUrl, credentials: 'include' });
  if (!client.interceptors.error.exists(typedFailure)) client.interceptors.error.use(typedFailure);
  if (!client.interceptors.request.exists(csrf)) client.interceptors.request.use(csrf);
}

/** An address on the API, for what the browser opens itself (a sign-in that leaves for GitHub). */
export function apiUrl(path: `/api/v1/${string}`, query: Readonly<Record<string, string>> = {}): string {
  const search = new URLSearchParams(query).toString();
  return `${apiBase}${path}${search === '' ? '' : `?${search}`}`;
}
