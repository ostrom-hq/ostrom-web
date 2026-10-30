// SPDX-License-Identifier: AGPL-3.0-only
import {
  deleteArtifactMutation,
  enrollSharedAccountMutation,
  listArtifactMembersOptions,
  listArtifactMembersQueryKey,
  listArtifactsOptions,
  listArtifactsQueryKey,
  listArtifactVersionsOptions,
  listMembersOptions,
  listSecretsOptions,
  listSharedAccountsOptions,
  listSharedAccountsQueryKey,
  removeSharedAccountMutation,
  shareArtifactMutation,
  unshareArtifactMutation,
  updateSharedAccountMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  Artifact,
  ArtifactVersion,
  EnrollSharedAccountData,
  Member,
  Secret,
  SharedAccount,
  UpdateSharedAccountData,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { useViewer } from '@/shared/auth/useViewer';
import { ready } from '@/shared/api/ready';

export interface ArtifactsViewModel {
  readonly artifacts: readonly Artifact[] | undefined;
  readonly failure: Error | undefined;
  /** Only an artifact's owner shares or deletes it. */
  readonly login: string | undefined;
}

export function useArtifacts(): ArtifactsViewModel {
  const artifacts = useQuery(ready(listArtifactsOptions()));
  const viewer = useViewer();
  return { artifacts: artifacts.data?.items, failure: failureOf(artifacts.error), login: viewer.login };
}

export interface ArtifactDetailViewModel {
  readonly versions: readonly ArtifactVersion[] | undefined;
  readonly readers: readonly string[] | undefined;
  /** The organization's members, to pick a new reader from: asked for its owner only, never in the way. */
  readonly members: readonly Member[] | undefined;
  readonly failure: Error | undefined;
}

/** Newest first, whatever order the server sends. */
export function newestFirst(versions: readonly ArtifactVersion[]): ArtifactVersion[] {
  return [...versions].sort((a, b) => b.number - a.number);
}

export function useArtifactDetail(id: string, owner: boolean): ArtifactDetailViewModel {
  const versions = useQuery(ready(listArtifactVersionsOptions({ path: { id } })));
  const readers = useQuery(ready(listArtifactMembersOptions({ path: { id } })));
  const members = useQuery({ ...ready(listMembersOptions(), { staleTime: 60_000 }), enabled: owner });
  const sorted = useMemo(
    () => (versions.data === undefined ? undefined : newestFirst(versions.data.items)),
    [versions.data],
  );
  return {
    versions: sorted,
    readers: readers.data?.members,
    members: members.data?.items,
    failure: failureOf(versions.error ?? readers.error),
  };
}

export interface ArtifactChangeViewModel {
  /** `onDone` runs once the server took it: the picker clears then, not before. */
  readonly share: (id: string, login: string, onDone: () => void) => void;
  readonly unshare: (id: string, login: string) => void;
  readonly remove: (id: string) => void;
  /** The artifact being changed. */
  readonly pending: string | undefined;
  readonly failure: Error | undefined;
}

export function useArtifactChange(): ArtifactChangeViewModel {
  const queryClient = useQueryClient();
  // The readers change, and the server may change the artifact's access with them (its badge on the list).
  const refreshReaders = useCallback(
    async (id: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listArtifactMembersQueryKey({ path: { id } }) }),
        queryClient.invalidateQueries({ queryKey: listArtifactsQueryKey() }),
      ]);
    },
    [queryClient],
  );
  const shared = useMutation({
    ...shareArtifactMutation(),
    onSettled: async (_data, _error, variables) => {
      await refreshReaders(variables.path.id);
    },
  });
  const unshared = useMutation({
    ...unshareArtifactMutation(),
    onSettled: async (_data, _error, variables) => {
      await refreshReaders(variables.path.id);
    },
  });
  const dropped = useMutation({
    ...deleteArtifactMutation(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listArtifactsQueryKey() });
    },
  });
  const { mutate: shareMutate, reset: resetShare } = shared;
  const { mutate: unshareMutate, reset: resetUnshare } = unshared;
  const { mutate: dropMutate, reset: resetDrop } = dropped;
  const share = useCallback(
    (id: string, login: string, onDone: () => void) => {
      resetUnshare();
      resetDrop();
      shareMutate({ path: { id, memberId: login } }, { onSuccess: onDone });
    },
    [shareMutate, resetUnshare, resetDrop],
  );
  const unshare = useCallback(
    (id: string, login: string) => {
      resetShare();
      resetDrop();
      unshareMutate({ path: { id, memberId: login } });
    },
    [unshareMutate, resetShare, resetDrop],
  );
  const remove = useCallback(
    (id: string) => {
      resetShare();
      resetUnshare();
      dropMutate({ path: { id } });
    },
    [dropMutate, resetShare, resetUnshare],
  );
  return {
    share,
    unshare,
    remove,
    pending: shared.isPending
      ? shared.variables.path.id
      : unshared.isPending
        ? unshared.variables.path.id
        : dropped.isPending
          ? dropped.variables.path.id
          : undefined,
    failure: failureOf(shared.error ?? unshared.error ?? dropped.error),
  };
}

export interface AccountsViewModel {
  readonly accounts: readonly SharedAccount[] | undefined;
  /** The secrets a new subscription's credential can come from. */
  readonly secrets: readonly Secret[] | undefined;
  readonly members: readonly Member[] | undefined;
  readonly failure: Error | undefined;
  /** Only a subscription's owner changes or removes it. */
  readonly login: string | undefined;
}

export function useAccounts(): AccountsViewModel {
  const accounts = useQuery(ready(listSharedAccountsOptions()));
  const secrets = useQuery(ready(listSecretsOptions()));
  const members = useQuery(ready(listMembersOptions()));
  const viewer = useViewer();
  return {
    accounts: accounts.data?.items,
    secrets: secrets.data?.items,
    members: members.data?.items,
    // Without the secrets or the members the form to share a subscription cannot show: say why.
    failure: failureOf(accounts.error ?? secrets.error ?? members.error),
    login: viewer.login,
  };
}

export type EnrollBody = EnrollSharedAccountData['body'];
export type AccountUpdate = UpdateSharedAccountData['body'];

export interface AccountChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, not before. */
  readonly enroll: (body: EnrollBody, onDone: () => void) => void;
  readonly update: (id: string, body: AccountUpdate) => void;
  readonly remove: (id: string) => void;
  /** The subscription being changed, or `true` while one is enrolled. */
  readonly pending: string | true | undefined;
  readonly failure: Error | undefined;
}

export function useAccountChange(): AccountChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: listSharedAccountsQueryKey() });
  }, [queryClient]);
  const enrolled = useMutation({ ...enrollSharedAccountMutation(), onSuccess: refresh });
  const updated = useMutation({ ...updateSharedAccountMutation(), onSettled: refresh });
  const dropped = useMutation({ ...removeSharedAccountMutation(), onSettled: refresh });
  const { mutate: enrollMutate, reset: resetEnroll } = enrolled;
  const { mutate: updateMutate, reset: resetUpdate } = updated;
  const { mutate: dropMutate, reset: resetDrop } = dropped;
  const enroll = useCallback(
    (body: EnrollBody, onDone: () => void) => {
      resetUpdate();
      resetDrop();
      enrollMutate({ body }, { onSuccess: onDone });
    },
    [enrollMutate, resetUpdate, resetDrop],
  );
  const update = useCallback(
    (id: string, body: AccountUpdate) => {
      resetEnroll();
      resetDrop();
      updateMutate({ path: { id }, body });
    },
    [updateMutate, resetEnroll, resetDrop],
  );
  const remove = useCallback(
    (id: string) => {
      resetEnroll();
      resetUpdate();
      dropMutate({ path: { id } });
    },
    [dropMutate, resetEnroll, resetUpdate],
  );
  return {
    enroll,
    update,
    remove,
    pending: enrolled.isPending
      ? true
      : updated.isPending
        ? updated.variables.path.id
        : dropped.isPending
          ? dropped.variables.path.id
          : undefined,
    failure: failureOf(enrolled.error ?? updated.error ?? dropped.error),
  };
}
