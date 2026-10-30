// SPDX-License-Identifier: AGPL-3.0-only
import { isApiFailure } from '@/shared/api/ApiFailure';

/** The server said no (4xx): asking again in two seconds gets the same answer. */
export function isRefusal(error: unknown): boolean {
  return isApiFailure(error) && error.status !== undefined && error.status >= 400 && error.status < 500;
}

/** A polling interval that stops on a refusal (a revoked sign-in, a request that does not exist) and resumes on none. */
export function pollUnlessRefused(
  ms: number,
): (query: { readonly state: { readonly error: unknown } }) => number | false {
  return (query) => (isRefusal(query.state.error) ? false : ms);
}
