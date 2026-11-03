// SPDX-License-Identifier: AGPL-3.0-only
import { handleAnswerDeviceLogin, handleGetDeviceLogin } from '@gen/api/msw.gen';
import type { ApiError } from '@gen/api/types.gen';
import { zDeviceAnswer } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import type { MockDeviceLogin } from '@/mocks/fixtures/device';
import { readJson, refusal } from '@/mocks/http';

export interface DeviceState {
  /** The `ostrom login`s started, answered or not. */
  deviceLogins: MockDeviceLogin[];
  signedIn: boolean;
  /** When the person signed in (ms since the epoch): approving an admin sign-in needs a recent one. */
  signedInAt: number;
}

/** What the console asks of the person, beyond being signed in. */
export interface DevicePermissions {
  /** The person owns or administers the organization they act in: only they approve `ostrom login --admin`. */
  readonly manages: () => boolean;
  /** How long a sign-in may approve an admin sign-in (ms), as for a yes on the server. */
  readonly freshSignInMs: number;
}

/** A code as the server reads it (`normalizeUserCode`): capitals, without dashes nor spaces. */
function lettersOf(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * The console side of `ostrom login`, as the server answers it: a browser session reads the login a code started,
 * then approves or denies it once. An unknown, expired or answered code is not found, the same for all three.
 */
export function createDeviceHandlers(
  state: () => DeviceState,
  now: () => Date,
  permissions: DevicePermissions,
): HttpHandler[] {
  const pendingOf = (code: string): MockDeviceLogin | undefined =>
    state().deviceLogins.find(
      (login) =>
        login.status === 'pending' &&
        lettersOf(login.authorization.userCode) === lettersOf(code) &&
        Date.parse(login.authorization.expiresAt) > now().getTime(),
    );
  const gone = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'Unknown or expired code.');
  return [
    handleGetDeviceLogin(({ request }) => {
      if (!state().signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      const code = new URL(request.url).searchParams.get('userCode');
      if (code === null) return refusal(400, 'invalid_request', 'userCode is required.');
      const login = pendingOf(code);
      return login === undefined ? gone() : HttpResponse.json(login.authorization);
    }),
    handleAnswerDeviceLogin(async ({ request }) => {
      const s = state();
      if (!s.signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      const body = zDeviceAnswer.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'a user code and an answer are needed');
      const login = pendingOf(body.data.userCode);
      if (login === undefined) return gone();
      // `ostrom login --admin`: a recent sign-in first, then an owner or an admin, as the server checks them.
      if (body.data.approve && login.authorization.scopes !== undefined) {
        if (now().getTime() - s.signedInAt > permissions.freshSignInMs)
          return refusal(
            403,
            'step_up_required',
            'Sign in again to approve an admin sign-in: your sign-in is more than five minutes old.',
          );
        if (!permissions.manages())
          return refusal(
            403,
            'forbidden',
            'Only an owner or an admin of the organization approves ostrom login --admin.',
          );
      }
      login.status = body.data.approve ? 'approved' : 'denied';
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
