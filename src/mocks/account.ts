// SPDX-License-Identifier: AGPL-3.0-only
import { handleListAuthSessions, handleLogoutEverywhere, handleRevokeAuthSession } from '@gen/api/msw.gen';
import type { AuthSession } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { refusal } from '@/mocks/http';

export interface AccountState {
  /** The person's signed-in sessions, the current one first. */
  authSessions: AuthSession[];
  /** The session cookie holds an account: a sign-out empties it. */
  signedIn: boolean;
}

/** What the browser's cookies become when its session ends. */
const SIGNED_OUT = { 'Set-Cookie': 'ostrom_csrf=; Path=/; Max-Age=0' };

/**
 * The sessions of the security settings. `GET` and `DELETE /auth/sessions` are planned in the contract and not
 * served yet: the demo answers them as the contract says. Signing out everywhere is served.
 */
export function createAccountHandlers(state: () => AccountState, now: () => Date): HttpHandler[] {
  return [
    handleListAuthSessions(() => {
      const s = state();
      if (!s.signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      // A sign-in after signing out everywhere opened a new session: this browser's.
      if (!s.authSessions.some((session) => session.current)) {
        const at = now().toISOString();
        s.authSessions = [
          {
            id: `ses-${String(now().getTime())}`,
            createdAt: at,
            lastSeenAt: at,
            device: 'This browser',
            current: true,
          },
          ...s.authSessions,
        ];
      }
      return HttpResponse.json({ items: s.authSessions });
    }),
    handleRevokeAuthSession(({ params }) => {
      const s = state();
      const session = s.authSessions.find((item) => item.id === params.id);
      if (session === undefined) return refusal(404, 'not_found', 'session not found');
      s.authSessions = s.authSessions.filter((item) => item !== session);
      // Ending the session this browser holds signs it out.
      if (!session.current) return new HttpResponse(null, { status: 204 });
      s.signedIn = false;
      return new HttpResponse(null, { status: 204, headers: SIGNED_OUT });
    }),
    handleLogoutEverywhere(() => {
      const s = state();
      s.authSessions = [];
      s.signedIn = false;
      return new HttpResponse(null, { status: 204, headers: SIGNED_OUT });
    }),
  ];
}
