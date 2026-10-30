// SPDX-License-Identifier: AGPL-3.0-only
import {
  deleteOrgMutation,
  getOrgQueryKey,
  listAuthSessionsOptions,
  listAuthSessionsQueryKey,
  listMyOrganizationsQueryKey,
  listOrgsQueryKey,
  logoutEverywhereMutation,
  renameOrgMutation,
  revokeAuthSessionMutation,
} from '@gen/api/@tanstack/react-query.gen';
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
  /** Renames it; the field starts again from the new name once the lists have it. */
  readonly rename: (name: string) => void;
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listOrgsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: listMyOrganizationsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getOrgQueryKey({ path: { org: org.id } }) }),
      ]),
  });
  const { mutate, reset } = mutation;
  const rename = useCallback(
    (name: string) => {
      mutate({ path: { org: org.id }, body: { name: name.trim() } });
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
  /** The server wants a sign-in less than five minutes old before deleting. */
  readonly stepUp: boolean;
  readonly failure: Error | undefined;
}

export function useDeleteOrg(org: OrgView): DeleteOrgViewModel {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    ...deleteOrgMutation(),
    onSuccess: async () => {
      // The switch's list goes before the choice does (which resets every other read), so nothing offers the
      // organization just deleted; then both lists are read again.
      queryClient.removeQueries({ queryKey: listMyOrganizationsQueryKey() });
      useOrgStore.getState().forget();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listOrgsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: listMyOrganizationsQueryKey() }),
      ]);
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

export interface SessionActionsViewModel {
  /** Ends another session; ending this browser's signs it out. */
  readonly revoke: (session: AuthSession) => void;
  readonly revoking: string | undefined;
  /** Ends every browser session of the person, this one included. Tokens keep working. */
  readonly signOutEverywhere: () => void;
  readonly signingOut: boolean;
  readonly failure: Error | undefined;
}

export function useSessionActions(): SessionActionsViewModel {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signedOut = useCallback(async () => {
    // Off this page first, so nothing on it reads again as nobody; then everything cached, this account's, goes.
    await navigate({ to: '/signin', search: { redirect: '/settings' } });
    useAuthStore.getState().changed();
  }, [navigate]);
  const relist = useCallback(
    () => queryClient.invalidateQueries({ queryKey: listAuthSessionsQueryKey() }),
    [queryClient],
  );
  const revocation = useMutation(revokeAuthSessionMutation());
  const everywhere = useMutation({ ...logoutEverywhereMutation(), onSuccess: signedOut });
  const { mutate: revokeMutate, reset: resetRevocation } = revocation;
  const { mutate: everywhereMutate, reset: resetEverywhere } = everywhere;
  const revoke = useCallback(
    (session: AuthSession) => {
      resetEverywhere();
      // This browser's session ended: the list is not read again with a cookie that no longer works.
      revokeMutate(
        { path: { id: session.id } },
        session.current ? { onSuccess: signedOut, onError: relist } : { onSettled: relist },
      );
    },
    [revokeMutate, resetEverywhere, signedOut, relist],
  );
  const signOutEverywhere = useCallback(() => {
    resetRevocation();
    everywhereMutate({});
  }, [everywhereMutate, resetRevocation]);
  return {
    revoke,
    revoking: revocation.isPending ? revocation.variables.path.id : undefined,
    signOutEverywhere,
    signingOut: everywhere.isPending,
    failure: failureOf(revocation.error ?? everywhere.error),
  };
}
