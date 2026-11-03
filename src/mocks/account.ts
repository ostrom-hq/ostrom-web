// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleGetMyAccount,
  handleLinkSignInProvider,
  handleListAuthSessions,
  handleLogoutEverywhere,
  handleRevokeAuthSession,
} from '@gen/api/msw.gen';
import type { Account, AuthSession, LinkStarted } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { refusal } from '@/mocks/http';

export interface AccountState {
  /** The person's signed-in sessions, the current one first. */
  authSessions: AuthSession[];
  /** The session cookie holds an account: a sign-out empties it. */
  signedIn: boolean;
  /** How the person signs in (`github`, `google`, `email`): Maya signed up with GitHub. */
  providers: string[];
}

/** The providers a person can link, as the server offers them. */
const LINKABLE = new Set(['github', 'google']);

/** GitHub's consent page for the demo's link: the demo leaves for it as the console would. */
export const DEMO_GITHUB_CONSENT =
  'https://github.com/login/oauth/authorize?client_id=ostrom-demo&state=demo';

/** Maya's account, as `GET /auth/me/account` reads it. */
function accountOf(s: AccountState): Account {
  return {
    id: MEMBER_IDS.maya,
    login: 'maya',
    displayName: 'Maya Lind',
    primaryEmail: 'maya@acme.dev',
    createdAt: '2026-09-01T09:00:00Z',
    emails: [{ email: 'maya@acme.dev', verified: true }],
    providers: s.providers,
  };
}

/** What the browser's cookies become when its session ends. */
const SIGNED_OUT = { 'Set-Cookie': 'ostrom_csrf=; Path=/; Max-Age=0' };

/**
 * The sessions of the security settings. `GET` and `DELETE /auth/sessions` are planned in the contract and not
 * served yet: the demo answers them as the contract says. Signing out everywhere is served.
 */
export function createAccountHandlers(state: () => AccountState, now: () => Date): HttpHandler[] {
  return [
    handleGetMyAccount(() => {
      const s = state();
      if (!s.signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      return HttpResponse.json(accountOf(s));
    }),
    // Linking starts on the server and ends on the provider's consent page; the demo never comes back from it.
    handleLinkSignInProvider(({ params }) => {
      if (!state().signedIn) return refusal(401, 'unauthorized', 'nobody is signed in');
      if (!LINKABLE.has(params.provider)) return refusal(404, 'not_found', 'no such provider');
      return HttpResponse.json<LinkStarted>({ authorizationUrl: DEMO_GITHUB_CONSENT });
    }),
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
