import { client } from '@gen/api/client.gen';
import { toApiFailure } from '@/shared/api/ApiFailure';

export interface ApiClientConfig {
  /** Where the Ostrom API lives, e.g. `/api` behind the same origin. */
  readonly baseUrl: string;
  /** The viewer's in-memory bearer token, read at each call so a sign-in or sign-out applies at once. */
  readonly getToken: () => string | undefined;
}

function typedFailure(error: unknown, response: Response | undefined): Error {
  return toApiFailure(error, response);
}

/**
 * Points the generated client at the server, sends the viewer's credentials and types every failure. Every
 * call carries the server's `HttpOnly` session cookie (`credentials: 'include'`, audit S2-08), which no
 * script on the page can read.
 */
export function configureApiClient({ baseUrl, getToken }: ApiClientConfig): void {
  client.setConfig({ baseUrl, credentials: 'include', auth: () => getToken() });
  if (!client.interceptors.error.exists(typedFailure)) client.interceptors.error.use(typedFailure);
}
