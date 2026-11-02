// SPDX-License-Identifier: AGPL-3.0-only
import {
  getMeOptions,
  requestSignInEmailMutation,
  verifySignInEmailMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAuthStore } from '@/shared/auth/authStore';
import { meOf, signedInName } from '@/shared/auth/me';
import { emailAsked, useEmailLinkStore } from './emailLink';
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
  const mutation = useMutation({
    ...requestSignInEmailMutation(),
    // The link this browser asked for is expected here: opened within its life, it is spent without a question.
    onSuccess: () => {
      emailAsked.mark(Date.now());
    },
  });
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

export type EmailLinkState = 'missing' | 'asking' | 'verifying' | 'failed';

export interface EmailLinkViewModel {
  readonly state: EmailLinkState;
  readonly failure: Error | undefined;
  /** Who this browser is signed in as while the link waits for a yes, when the server said. */
  readonly signedInAs: string | undefined;
  /** Spends the link, replacing the session in this browser: only offered while asking. */
  readonly accept: () => void;
  /** Drops the link unspent and keeps the session as it is. */
  readonly keep: () => void;
}

/**
 * Spends the e-mailed token once, then opens the page the link was asked from. Nobody signed in, or a link this browser
 * asked for (`emailAsked`): at once. Someone signed in, or no way to tell: only after a yes, since the link may be
 * another account's. A link opened from another
 * site would otherwise replace the session in this browser without a word (login CSRF), and what the person does next
 * (a secret saved, a GitHub installation, a yes) would land in that account.
 */
export function useEmailLink(): EmailLinkViewModel {
  const navigate = useNavigate();
  const token = useEmailLinkStore((store) => store.token);
  const take = useEmailLinkStore((store) => store.take);
  const give = useEmailLinkStore((store) => store.spend);
  const changed = useAuthStore((auth) => auth.changed);
  // Asked afresh and once: replacing a session rests on this answer, never on a cached or failed one.
  const me = useQuery(ready(getMeOptions(), { retry: false, staleTime: 0 }));
  const known = !me.isFetching;
  // Nobody is signed in only when the server says so (401, or 204 with no body); any other failure may hide a session.
  const signedOut =
    known &&
    ((isApiFailure(me.error) && me.error.kind === 'unauthorized') ||
      (me.isSuccess && meOf(me.data) === undefined));
  const current = me.isSuccess ? meOf(me.data) : undefined;
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
  const spend = useCallback(() => {
    // Given once: a link signs in a single time, even when a screen mounts twice.
    emailAsked.clear();
    give((held) => {
      mutate({ body: { token: held } });
    });
  }, [give, mutate]);
  useEffect(() => {
    if (token !== undefined && (signedOut || emailAsked.recent(Date.now()))) spend();
  }, [signedOut, token, spend]);
  const keep = useCallback(() => {
    take();
    emailAsked.clear();
    void navigate({ to: '/', replace: true });
  }, [take, navigate]);
  let state: EmailLinkState = 'missing';
  if (mutation.isError) state = 'failed';
  else if (!mutation.isIdle) state = 'verifying';
  else if (token !== undefined) state = known && !signedOut ? 'asking' : 'verifying';
  return {
    state,
    failure: failureOf(mutation.error),
    signedInAs: current === undefined ? undefined : signedInName(current),
    accept: spend,
    keep,
  };
}
