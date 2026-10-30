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
  /** Renames it; `onSaved` runs once the server took the new name. */
  readonly rename: (name: string, onSaved: () => void) => void;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly failure: Error | undefined;
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
  const { mutate } = mutation;
  const rename = useCallback(
    (name: string, onSaved: () => void) => {
      mutate({ path: { org: org.id }, body: { name: name.trim() } }, { onSuccess: onSaved });
    },
    [mutate, org.id],
  );
  return {
    rename,
    saving: mutation.isPending,
    saved: mutation.isSuccess,
    failure: failureOf(mutation.error),
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
      // The choice goes first (every read in it is reset), then the lists the switch keeps are read again.
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
    // Everything cached was this account's: the console starts again as nobody, on the sign-in page.
    useAuthStore.getState().changed();
    await navigate({ to: '/signin', search: { redirect: '/settings' } });
  }, [navigate]);
  const revocation = useMutation({
    ...revokeAuthSessionMutation(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listAuthSessionsQueryKey() }),
  });
  const everywhere = useMutation({ ...logoutEverywhereMutation(), onSuccess: signedOut });
  const { mutate: revokeMutate, reset: resetRevocation } = revocation;
  const { mutate: everywhereMutate, reset: resetEverywhere } = everywhere;
  const revoke = useCallback(
    (session: AuthSession) => {
      resetEverywhere();
      revokeMutate({ path: { id: session.id } }, session.current ? { onSuccess: signedOut } : undefined);
    },
    [revokeMutate, resetEverywhere, signedOut],
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
