// SPDX-License-Identifier: AGPL-3.0-only
import { requestSignInEmailMutation, verifySignInEmailMutation } from '@gen/api/@tanstack/react-query.gen';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useAuthStore } from '@/shared/auth/authStore';
import { useEmailLinkStore } from './emailLink';
import { safeRedirect } from './model';

export interface EmailSignInViewModel {
  readonly send: (email: string) => void;
  readonly sending: boolean;
  /** The address a link went to; the server answers the same whether it has an account or not. */
  readonly sentTo: string | undefined;
  /** Back to the form, to send to another address. */
  readonly again: () => void;
  readonly failure: Error | undefined;
}

export function useEmailSignIn(redirect: string | undefined): EmailSignInViewModel {
  const mutation = useMutation(requestSignInEmailMutation());
  const { mutate, reset } = mutation;
  const send = useCallback(
    (email: string) => {
      const address = email.trim();
      mutate({ body: redirect === undefined ? { email: address } : { email: address, redirect } });
    },
    [mutate, redirect],
  );
  return {
    send,
    sending: mutation.isPending,
    sentTo: mutation.isSuccess ? mutation.variables.body.email : undefined,
    again: reset,
    failure: failureOf(mutation.error),
  };
}

export type EmailLinkState = 'missing' | 'verifying' | 'failed';

/** Spends the e-mailed token once, then opens the page the link was asked from. */
export function useEmailLink(): { readonly state: EmailLinkState; readonly failure: Error | undefined } {
  const navigate = useNavigate();
  const take = useEmailLinkStore((store) => store.take);
  const changed = useAuthStore((auth) => auth.changed);
  const mutation = useMutation({
    ...verifySignInEmailMutation(),
    // A new session in the cookie: everything read before is dropped (the cookie is the session), then the page the
    // link was asked from opens.
    onSuccess: async (signedIn) => {
      changed();
      await navigate({ href: safeRedirect(signedIn.redirect), replace: true });
    },
  });
  const { mutate } = mutation;
  useEffect(() => {
    const token = take();
    if (token !== undefined) mutate({ body: { token } });
  }, [take, mutate]);
  return {
    state: mutation.isIdle ? 'missing' : mutation.isError ? 'failed' : 'verifying',
    failure: failureOf(mutation.error),
  };
}
