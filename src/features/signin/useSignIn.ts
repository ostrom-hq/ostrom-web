// SPDX-License-Identifier: AGPL-3.0-only
import {
  getMeQueryKey,
  requestSignInEmailMutation,
  verifySignInEmailMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useEmailLinkStore } from './emailLink';
import { safeRedirect } from './model';

export interface EmailSignInViewModel {
  readonly send: (email: string) => void;
  readonly sending: boolean;
  /** The address a link went to; the server answers the same whether it has an account or not. */
  readonly sentTo: string | undefined;
  readonly failure: Error | undefined;
}

export function useEmailSignIn(redirect: string | undefined): EmailSignInViewModel {
  const mutation = useMutation(requestSignInEmailMutation());
  const { mutate } = mutation;
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
    failure: failureOf(mutation.error),
  };
}

export type EmailLinkState = 'missing' | 'verifying' | 'failed';

/** Spends the e-mailed token once, then opens the page the link was asked from. */
export function useEmailLink(): { readonly state: EmailLinkState; readonly failure: Error | undefined } {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const take = useEmailLinkStore((store) => store.take);
  const mutation = useMutation({
    ...verifySignInEmailMutation(),
    onSuccess: async (signedIn) => {
      await queryClient.invalidateQueries({ queryKey: getMeQueryKey() });
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
