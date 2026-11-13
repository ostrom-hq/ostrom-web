// SPDX-License-Identifier: Apache-2.0
import { getMeOptions, logoutMutation } from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAuthStore } from '@/shared/auth/authStore';
import { meOf } from '@/shared/auth/me';

export interface SignOutViewModel {
  /** `/yes?signout` is open and someone is signed in: the queue asks before ending the session. */
  readonly asked: boolean;
  /** Ends the session (`POST /auth/logout`): what is shown next is read as nobody. */
  readonly signOut: () => void;
  readonly stay: () => Promise<void>;
  readonly signingOut: boolean;
  readonly failure: Error | undefined;
}

/**
 * A sign-out asked by the address, answered by the person. The address is no proof the person asked: a page of
 * another site can open `/yes?signout`, and a session ended without a word is the first step to signing the browser
 * in as someone else (login CSRF, audit AUDIT-SECU-WEB-2 M2). The question lives in the address, so it never outlives
 * the visit that brought it, and it is only asked of a browser someone is signed in on.
 */
export function useSignOut(): SignOutViewModel {
  const { signout } = useSearch({ from: '/yes' });
  const navigate = useNavigate();
  const changed = useAuthStore((auth) => auth.changed);
  const me = useQuery(ready(getMeOptions(), { retry: false }));
  const signedIn = meOf(me.data) !== undefined;
  const leave = useCallback(async () => {
    await navigate({ to: '/yes', search: {}, replace: true });
  }, [navigate]);
  const mutation = useMutation({
    ...logoutMutation(),
    onSuccess: async () => {
      changed();
      await leave();
    },
  });
  const { mutate } = mutation;
  const signOut = useCallback(() => {
    mutate({});
  }, [mutate]);
  return {
    asked: signout === true && (signedIn || mutation.isPending || mutation.isError),
    signOut,
    stay: leave,
    signingOut: mutation.isPending,
    failure: failureOf(mutation.error),
  };
}
