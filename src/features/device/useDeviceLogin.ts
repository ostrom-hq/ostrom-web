// SPDX-License-Identifier: AGPL-3.0-only
import { answerDeviceLoginMutation, getDeviceLoginOptions } from '@gen/api/@tanstack/react-query.gen';
import type { DeviceAuthorization } from '@gen/api/types.gen';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ORG_REQUIRED } from '@/shared/api/orgHeader';
import { ready } from '@/shared/api/ready';
import { stepUpOf } from '@/shared/api/stepUp';
import { isUserCode, normalizeCode } from './model';

/** A pending `ostrom login`, read and still waiting for the person's answer. */
export interface OpenDeviceLogin {
  readonly stage: 'open';
  readonly login: DeviceAuthorization;
  /** The answer is on its way: neither button may be pressed again. */
  readonly answering: boolean;
  /** An admin sign-in the person may not approve: they are neither an owner nor an admin of the organization. */
  readonly forbidden: boolean;
  /**
   * An admin sign-in the server could not tie to one organization: the person belongs to several, and this route
   * names none (`org_required`). It cannot be approved from here.
   */
  readonly severalOrgs: boolean;
  /** Why the last answer did not go through (a sign-in too old to approve, the network…), if it did not. */
  readonly failure: Error | undefined;
  readonly approve: () => void;
  readonly deny: () => void;
}

/**
 * What the page shows. `enter`: no code in the address, the person types it. `reading`: the login is on its way, or
 * could not be read (`failure`). `signedOut`: only someone signed in answers; `back` is this page with its code.
 * `unknown`: no pending login has this code (`code`), or what the address holds is no code at all (none: it is never
 * shown back, so a crafted link cannot put its own words on the page). `open`: the login, to approve or deny. `approved`, `denied`: answered.
 * `gone`: the login ended (expired, or answered elsewhere) before the answer reached it.
 */
export type DeviceLoginView =
  | { readonly stage: 'enter' }
  | { readonly stage: 'reading'; readonly failure: Error | undefined }
  | { readonly stage: 'signedOut'; readonly back: string }
  | { readonly stage: 'unknown'; readonly code: string | undefined }
  | OpenDeviceLogin
  | { readonly stage: 'approved' }
  | { readonly stage: 'denied' }
  | { readonly stage: 'gone' };

export interface DeviceLoginViewModel {
  readonly view: DeviceLoginView;
  /** Reads the login of a code the person typed: it goes in the address, as the terminal's link would put it. */
  readonly read: (typed: string) => void;
}

/**
 * The console side of `ostrom login` (RFC 8628): the code the terminal shows, the login it started, and the person's
 * yes or no. The CLI waits for that answer and gets its token from it.
 */
export function useDeviceLogin(): DeviceLoginViewModel {
  const search = useSearch({ from: '/device' });
  // `?code=` with nothing in it is the page without a code.
  const code =
    search.code === undefined || search.code.trim() === '' ? undefined : normalizeCode(search.code);
  const valid = code !== undefined && isUserCode(code);
  const navigate = useNavigate();
  const pending = useQuery(
    ready(getDeviceLoginOptions({ query: { userCode: code ?? '' } }), {
      enabled: valid,
      // An unknown code or a signed-out person is said at once: asking again would answer the same.
      retry: false,
    }),
  );
  const answer = useMutation(answerDeviceLoginMutation());
  const read = (typed: string): void => {
    void navigate({ to: '/device', search: { code: normalizeCode(typed) }, replace: true });
  };
  if (code === undefined) return { view: { stage: 'enter' }, read };
  if (!valid) return { view: { stage: 'unknown', code: undefined }, read };
  // The answer given to this code, never one given to a code read before on this page.
  const asked = answer.variables?.body;
  const answerFailure = asked?.userCode === code ? failureOf(answer.error) : undefined;
  if (asked?.userCode === code && answer.isSuccess)
    return { view: { stage: asked.approve ? 'approved' : 'denied' }, read };
  // Only a 404 means the code is dead (expired, or answered elsewhere): the answer's one 409 is `org_required`.
  if (isApiFailure(answerFailure) && answerFailure.kind === 'not-found')
    return { view: { stage: 'gone' }, read };
  const login = pending.data;
  if (login === undefined) {
    const failure = failureOf(pending.error);
    const kind = isApiFailure(failure) ? failure.kind : undefined;
    if (kind === 'unauthorized')
      return {
        view: { stage: 'signedOut', back: `/device?${new URLSearchParams({ code }).toString()}` },
        read,
      };
    if (kind === 'not-found') return { view: { stage: 'unknown', code }, read };
    return { view: { stage: 'reading', failure }, read };
  }
  // On an admin sign-in, a 403 that signing in again lifts is said with its way back; any other one means the role is
  // missing. An ordinary sign-in asks for no role: its 403 is said as it came.
  const forbidden =
    login.scopes !== undefined &&
    isApiFailure(answerFailure) &&
    answerFailure.kind === 'forbidden' &&
    !stepUpOf(answerFailure);
  const severalOrgs = isApiFailure(answerFailure) && answerFailure.code === ORG_REQUIRED;
  const say = (approve: boolean): void => {
    answer.mutate({ body: { userCode: code, approve } });
  };
  return {
    view: {
      stage: 'open',
      login,
      answering: answer.isPending,
      forbidden,
      severalOrgs,
      failure: forbidden || severalOrgs ? undefined : answerFailure,
      approve: () => {
        say(true);
      },
      deny: () => {
        say(false);
      },
    },
    read,
  };
}
