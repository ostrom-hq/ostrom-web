// SPDX-License-Identifier: Apache-2.0
import {
  deleteOrgMutation,
  getOrgQueryKey,
  listAuthSessionsOptions,
  listAuthSessionsQueryKey,
  listMyOrganizationsQueryKey,
  listOrgsQueryKey,
  logoutEverywhereMutation,
  renameOrgMutation,
} from '@gen/api/@tanstack/react-query.gen';
import { revokeAuthSession } from '@gen/api/sdk.gen';
import type { AuthSession, OrgView } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { stepUpOf } from '@/shared/api/stepUp';
import { useAuthStore } from '@/shared/auth/authStore';
import { useOrgStore } from '@/shared/org/orgStore';
import { sortSessions } from './model';

export interface RenameViewModel {
  /** Renames it; `onSaved` runs once the lists have the new name. */
  readonly rename: (name: string, onSaved: () => void) => void;
  readonly saving: boolean;
  /** The name the server just took, until the field changes again. */
  readonly saved: string | undefined;
  readonly failure: Error | undefined;
  /** The field changed: what was said about the last save no longer applies. */
  readonly edited: () => void;
}

export function useRenameOrg(org: OrgView): RenameViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...renameOrgMutation(),
    // The top bar's switch and every screen read the name from the person's lists.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listOrgsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: listMyOrganizationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getOrgQueryKey({ path: { org: org.id } }) }),
      ]);
    },
  });
  const { mutate, reset } = mutation;
  const rename = useCallback(
    (name: string, onSaved: () => void) => {
      mutate({ path: { org: org.id }, body: { name: name.trim() } }, { onSuccess: onSaved });
    },
    [mutate, org.id],
  );
  return {
    rename,
    saving: mutation.isPending,
    saved: mutation.isSuccess ? mutation.data.name : undefined,
    failure: failureOf(mutation.error),
    edited: reset,
  };
}

export interface DeleteOrgViewModel {
  readonly remove: (confirm: string) => void;
  readonly deleting: boolean;
  /**
   * The server wants a sign-in less than five minutes old before deleting (`step_up_required`). The contract asks it;
   * the server does not enforce it yet (JOURNAL, AUTH-REPRISE), so this only shows when it actually refuses.
   */
  readonly stepUp: boolean;
  readonly failure: Error | undefined;
}

export function useDeleteOrg(org: OrgView): DeleteOrgViewModel {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    ...deleteOrgMutation(),
    onSuccess: async () => {
      // The switch's list, which the choice keeps, is read again from nothing, so it never offers the organization
      // just deleted; dropping the choice reads everything else again.
      void queryClient.resetQueries({ queryKey: listMyOrganizationsQueryKey() });
      useOrgStore.getState().forget();
      await navigate({ to: '/' });
    },
  });
  const { mutate } = mutation;
  const remove = useCallback(
    (confirm: string) => {
      mutate({ path: { org: org.id }, body: { confirm } });
    },
    [mutate, org.id],
  );
  const stepUp = stepUpOf(mutation.error);
  return {
    remove,
    deleting: mutation.isPending,
    stepUp,
    failure: stepUp ? undefined : failureOf(mutation.error),
  };
}

export interface SessionsViewModel {
  /** This browser first; undefined while loading or when the server does not list sessions. */
  readonly sessions: readonly AuthSession[] | undefined;
  /** The server does not serve the list (it is planned in the contract): the section keeps only its actions. */
  readonly unavailable: boolean;
  readonly failure: Error | undefined;
}

export function useAuthSessions(): SessionsViewModel {
  const query = useQuery(ready(listAuthSessionsOptions(), { retry: false }));
  const sorted = useMemo(
    () => (query.data === undefined ? undefined : sortSessions(query.data.items)),
    [query.data],
  );
  const unavailable = isApiFailure(query.error) && query.error.kind === 'not-found';
  return { sessions: sorted, unavailable, failure: unavailable ? undefined : failureOf(query.error) };
}

/** The page of the person's sessions, where a new sign-in comes back. */
export type SessionsPage = '/settings' | '/account';

export interface SessionActionsViewModel {
  /** Ends another session; ending this browser's signs it out. */
  readonly revoke: (session: AuthSession) => void;
  readonly revoking: string | undefined;
  /** Ends every browser session of the person, this one included. Tokens keep working. */
  readonly signOutEverywhere: () => void;
  readonly signingOut: boolean;
  readonly failure: Error | undefined;
}

/** The session actions of a page (`back`): signing this browser out comes back to it after the next sign-in. */
export function useSessionActions(back: SessionsPage): SessionActionsViewModel {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signedOut = useCallback(async () => {
    // Off this page first, so nothing on it reads again as nobody; then everything cached, this account's, goes.
    await navigate({ to: '/signin', search: { redirect: back } });
    useAuthStore.getState().changed();
  }, [navigate, back]);
  const relist = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listAuthSessionsQueryKey() });
  }, [queryClient]);
  // A revocation stays pending until the list is read again, so its row never offers it twice. Whether it ends this
  // browser's session is fixed when it is asked: that one signs out, without reading the list with a dead cookie.
  const revocation = useMutation({
    mutationFn: async ({ session }: { readonly session: AuthSession }) => {
      await revokeAuthSession({ path: { id: session.id }, throwOnError: true });
    },
    onSuccess: async (_data, { session }) => {
      await (session.current ? signedOut() : relist());
    },
    onError: relist,
  });
  const everywhere = useMutation({ ...logoutEverywhereMutation(), onSuccess: signedOut });
  const { mutate: revokeMutate, reset: resetRevocation } = revocation;
  const { mutate: everywhereMutate, reset: resetEverywhere } = everywhere;
  const revoke = useCallback(
    (session: AuthSession) => {
      resetEverywhere();
      revokeMutate({ session });
    },
    [revokeMutate, resetEverywhere],
  );
  const signOutEverywhere = useCallback(() => {
    resetRevocation();
    everywhereMutate({});
  }, [everywhereMutate, resetRevocation]);
  return {
    revoke,
    revoking: revocation.isPending ? revocation.variables.session.id : undefined,
    signOutEverywhere,
    signingOut: everywhere.isPending,
    failure: failureOf(revocation.error ?? everywhere.error),
  };
}
