import { client } from '@gen/api/client.gen';
import { toApiFailure } from '@/shared/api/ApiFailure';

export interface ApiClientConfig {
  /** The origin of the Ostrom API (`''` for the same origin): the contract's paths carry `/api/v1`. */
  readonly baseUrl: string;
  /** The bearer token of the viewer, read at each call so a sign-in or sign-out applies at once. */
  readonly getToken: () => string | undefined;
}

function typedFailure(error: unknown, response: Response | undefined): Error {
  return toApiFailure(error, response);
}

/** Points the generated client at the server, sends the viewer's token and types every failure. */
export function configureApiClient({ baseUrl, getToken }: ApiClientConfig): void {
  client.setConfig({ baseUrl, auth: () => getToken() });
  if (!client.interceptors.error.exists(typedFailure)) client.interceptors.error.use(typedFailure);
}
