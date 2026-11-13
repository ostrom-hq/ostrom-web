// SPDX-License-Identifier: Apache-2.0
import { safeSessionStorage } from '@/shared/lib/safeStorage';

/** Where the invitation opened in this tab waits while its person signs in. */
export const INVITE_TOKEN_KEY = 'ostrom.invite.token';

/**
 * The secret of the invitation link opened, out of the address bar. It is kept in this tab's session storage, not in
 * memory only as the sign-in link is: someone who opens an invitation signed out goes through GitHub and back, and
 * the invitation must still be there. It goes once the invitation is accepted or found dead, and with the tab.
 */
export const inviteToken = {
  hold: (token: string): void => {
    safeSessionStorage.setItem(INVITE_TOKEN_KEY, token);
  },
  read: (): string | undefined => safeSessionStorage.getItem(INVITE_TOKEN_KEY) ?? undefined,
  drop: (): void => {
    safeSessionStorage.removeItem(INVITE_TOKEN_KEY);
  },
};
