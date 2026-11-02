// SPDX-License-Identifier: AGPL-3.0-only
import { logoutMutation } from '@gen/api/@tanstack/react-query.gen';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { create } from 'zustand';
import { failureOf } from '@/shared/api/failureOf';
import { useAuthStore } from '@/shared/auth/authStore';

interface SignOutAsk {
  /** `/yes?signout` was opened: the queue asks before ending the session. */
  readonly asked: boolean;
  readonly ask: () => void;
  readonly drop: () => void;
}

/**
 * A sign-out asked by an address, kept until the person answers. An address is no proof the person asked: a page of
 * another site can open `/yes?signout`, and a session ended without a word is the first step to signing the browser
 * in as someone else (login CSRF, audit AUDIT-SECU-WEB-2 M2).
 */
export const useSignOutAsk = create<SignOutAsk>()((set) => ({
  asked: false,
  ask: () => {
    set({ asked: true });
  },
  drop: () => {
    set({ asked: false });
  },
}));

export interface SignOutViewModel {
  readonly asked: boolean;
  /** Ends the session (`POST /auth/logout`): what is shown next is read as nobody. */
  readonly signOut: () => void;
  readonly stay: () => void;
  readonly signingOut: boolean;
  readonly failure: Error | undefined;
}

export function useSignOut(): SignOutViewModel {
  const asked = useSignOutAsk((ask) => ask.asked);
  const drop = useSignOutAsk((ask) => ask.drop);
  const changed = useAuthStore((auth) => auth.changed);
  const mutation = useMutation({
    ...logoutMutation(),
    onSuccess: () => {
      drop();
      changed();
    },
  });
  const { mutate, reset } = mutation;
  const signOut = useCallback(() => {
    mutate({});
  }, [mutate]);
  const stay = useCallback(() => {
    drop();
    reset();
  }, [drop, reset]);
  return { asked, signOut, stay, signingOut: mutation.isPending, failure: failureOf(mutation.error) };
}
