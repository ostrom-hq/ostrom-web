// SPDX-License-Identifier: Apache-2.0
import {
  bulkAssignEnvironmentVariantMutation,
  listEnvironmentAssignmentsOptions,
  listEnvironmentAssignmentsQueryKey,
  listEnvironmentVariantsOptions,
  listEnvironmentVariantsQueryKey,
  listMembersOptions,
  listMembersQueryKey,
  listPersonalEnvironmentVariantsOptions,
  listPersonalEnvironmentVariantsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import {
  assignEnvironmentVariant,
  createEnvironmentVariant,
  deleteEnvironmentVariant,
  excludeEnvironmentVariable,
  includeEnvironmentVariable,
  promoteEnvironmentVariant,
  unassignEnvironmentVariant,
  updateEnvironmentVariant,
} from '@gen/api/sdk.gen';
import type {
  EnvironmentBulkAssignment,
  EnvironmentVariant,
  EnvironmentVariantCreate,
  Member,
} from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { type MemberEnvironment, memberRows, type PersonalVariant, personalOf, sortVariants } from './model';

export interface EnvironmentAdminViewModel {
  /** The team's variants, by variable then name. */
  readonly variants: readonly EnvironmentVariant[] | undefined;
  /** The members' personal variants and their owners, for review; never a value. */
  readonly personal: readonly PersonalVariant[] | undefined;
  /** Every member with what they receive and what they are excluded from. */
  readonly members: readonly MemberEnvironment[] | undefined;
  /** The member list, to pick whom to assign or exclude; absent if it could not be read. */
  readonly directory: readonly Member[] | undefined;
  /** Why the variants cannot be read. */
  readonly failure: Error | undefined;
  /** Why the assignments cannot be read: the members, assign and exclude sections say it. */
  readonly assignmentsFailure: Error | undefined;
  readonly personalFailure: Error | undefined;
}

/** What an owner or an admin reads of the organization's environment: metadata only, never a value. */
export function useEnvironmentAdmin(): EnvironmentAdminViewModel {
  const variants = useQuery(ready(listEnvironmentVariantsOptions()));
  const personal = useQuery(ready(listPersonalEnvironmentVariantsOptions()));
  const assignments = useQuery(ready(listEnvironmentAssignmentsOptions()));
  // Only names: a refusal is not asked again, a member then reads as their id.
  const directory = useQuery(ready(listMembersOptions(), { staleTime: 60_000, retry: false }));
  const sorted = useMemo(
    () => (variants.data === undefined ? undefined : sortVariants(variants.data.items)),
    [variants.data],
  );
  const ownedPersonal = useMemo(
    () => (personal.data === undefined ? undefined : personalOf(personal.data.items)),
    [personal.data],
  );
  const rows = useMemo(
    () => (assignments.data === undefined ? undefined : memberRows(directory.data?.items, assignments.data)),
    [assignments.data, directory.data],
  );
  return {
    variants: sorted,
    personal: ownedPersonal,
    members: rows,
    directory: directory.data?.items,
    // Missing assignments would read as "nobody receives anything": each failed part is said where it shows.
    failure: failureOf(variants.error),
    assignmentsFailure: failureOf(assignments.error),
    personalFailure: failureOf(personal.error),
  };
}

export interface EnvironmentChangeViewModel {
  /** `onDone` runs once the server took it: the form clears then, and the value it held is gone. */
  readonly create: (body: EnvironmentVariantCreate, onDone: () => void) => void;
  /** A new name, or a new shared value (absent keeps the stored one), against the version read. */
  readonly update: (
    variant: EnvironmentVariant,
    change: { readonly name: string; readonly value: string; readonly expectedVersion: number },
    onDone: () => void,
  ) => void;
  readonly remove: (variant: EnvironmentVariant) => void;
  readonly bulkAssign: (variant: EnvironmentVariant) => void;
  readonly promote: (variant: EnvironmentVariant) => void;
  /** `value`: the member's own, for a per-member variant only. */
  readonly assign: (member: string, variant: EnvironmentVariant, value: string, onDone: () => void) => void;
  readonly unassign: (member: string, variable: string) => void;
  readonly exclude: (member: string, variable: string, onDone: () => void) => void;
  readonly include: (member: string, variable: string) => void;
  /** What the last bulk assignment did, and for which variant. */
  readonly bulkResult: { readonly variantId: string; readonly result: EnvironmentBulkAssignment } | undefined;
  readonly pending: boolean;
  readonly failure: Error | undefined;
}

/**
 * An administrator's writes on the environment, one at a time: they share a pending flag and a failure, and each reads
 * the variants and the assignments again, whether the server took it or not. A value rides in the write only: the
 * mutation is forgotten as soon as it settles, never cached.
 */
export function useEnvironmentChange(): EnvironmentChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all(
      [
        listEnvironmentVariantsQueryKey(),
        listPersonalEnvironmentVariantsQueryKey(),
        listEnvironmentAssignmentsQueryKey(),
        // A member who left is refused: the pickers then offer the members the organization has now.
        listMembersQueryKey(),
      ].map(async (queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  }, [queryClient]);
  const write = useMutation({
    mutationFn: async (call: () => Promise<unknown>) => call(),
    gcTime: 0,
    onSettled: refresh,
  });
  const bulk = useMutation({ ...bulkAssignEnvironmentVariantMutation(), onSettled: refresh });
  const { mutate, reset } = write;
  const { mutate: bulkMutate, reset: resetBulk } = bulk;
  const run = useCallback(
    (call: () => Promise<unknown>, onDone?: () => void) => {
      resetBulk();
      reset();
      mutate(call, {
        onSuccess: () => {
          reset();
          onDone?.();
        },
      });
    },
    [mutate, reset, resetBulk],
  );
  const bulkAssign = useCallback(
    (variant: EnvironmentVariant) => {
      reset();
      bulkMutate({ path: { id: variant.id } });
    },
    [bulkMutate, reset],
  );
  return {
    create: (body, onDone) => {
      run(async () => createEnvironmentVariant({ body, throwOnError: true }), onDone);
    },
    update: (variant, change, onDone) => {
      const name = change.name.trim();
      run(
        async () =>
          updateEnvironmentVariant({
            path: { id: variant.id },
            body: {
              expectedVersion: change.expectedVersion,
              ...(name === variant.name ? {} : { name }),
              ...(change.value === '' ? {} : { value: change.value }),
            },
            throwOnError: true,
          }),
        onDone,
      );
    },
    remove: (variant) => {
      run(async () => deleteEnvironmentVariant({ path: { id: variant.id }, throwOnError: true }));
    },
    bulkAssign,
    promote: (variant) => {
      run(async () => promoteEnvironmentVariant({ path: { id: variant.id }, throwOnError: true }));
    },
    assign: (member, variant, value, onDone) => {
      run(
        async () =>
          assignEnvironmentVariant({
            path: { member, variable: variant.variable },
            // A shared variant refuses a member value: one typed for another choice is never sent.
            body: variant.binding === 'shared' ? { variantId: variant.id } : { variantId: variant.id, value },
            throwOnError: true,
          }),
        onDone,
      );
    },
    unassign: (member, variable) => {
      run(async () => unassignEnvironmentVariant({ path: { member, variable }, throwOnError: true }));
    },
    exclude: (member, variable, onDone) => {
      run(async () => excludeEnvironmentVariable({ path: { member, variable }, throwOnError: true }), onDone);
    },
    include: (member, variable) => {
      run(async () => includeEnvironmentVariable({ path: { member, variable }, throwOnError: true }));
    },
    bulkResult: bulk.isSuccess ? { variantId: bulk.variables.path.id, result: bulk.data } : undefined,
    pending: write.isPending || bulk.isPending,
    failure: failureOf(write.error ?? bulk.error),
  };
}
