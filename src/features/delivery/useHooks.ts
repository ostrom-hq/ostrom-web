// SPDX-License-Identifier: Apache-2.0
import {
  listHookAssignmentsOptions,
  listHookAssignmentsQueryKey,
  listHooksOptions,
  listHooksQueryKey,
  listHookVersionsOptions,
  listHookVersionsQueryKey,
  readHookVersionOptions,
} from '@gen/api/@tanstack/react-query.gen';
import {
  clearHookAssignment,
  pinHook,
  setHookAssignment,
  setHookAudience,
  unpinHook,
} from '@gen/api/sdk.gen';
import type { HookArtifact, HookEntry, HookVersion, OrgMember } from '@gen/api/types.gen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { type Decision, type DecisionChoice, decisionsById } from './model';
import { type DeliveryChange, useDeliveryChange } from './useDeliveryChange';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import type { OrgMembers } from '@/shared/org/members';

export interface HookCatalogViewModel {
  readonly hooks: readonly HookEntry[] | undefined;
  readonly failure: Error | undefined;
}

/** The organization's team hooks: read by owners and admins only, as the server does. */
export function useHookCatalog(): HookCatalogViewModel {
  const catalog = useQuery(ready(listHooksOptions()));
  return { hooks: catalog.data?.items, failure: failureOf(catalog.error) };
}

export interface HookViewModel {
  readonly hook: HookEntry | undefined;
  /** Newest first. */
  readonly versions: readonly HookVersion[] | undefined;
  /** The explicit decisions by member id; absent until read. */
  readonly decisions: ReadonlyMap<string, Decision> | undefined;
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, read when asked. */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore'>;
  readonly failure: Error | undefined;
}

/** One hook with its versions and each member's decision. */
export function useHook(name: string): HookViewModel {
  const path = { name };
  const detail = useQuery(ready(listHookVersionsOptions({ path })));
  const assignments = useQuery(ready(listHookAssignmentsOptions({ path })));
  const members = useCurrentOrgMembers();
  const decisions = useMemo(
    () => (assignments.data === undefined ? undefined : decisionsById(assignments.data.items)),
    [assignments.data],
  );
  return {
    hook: detail.data?.hook,
    versions: detail.data?.versions,
    decisions,
    members: members.members,
    people: { more: members.more, loadingMore: members.loadingMore },
    failure: failureOf(detail.error ?? assignments.error),
  };
}

export interface HookChangeViewModel extends Pick<DeliveryChange, 'pending' | 'failure'> {
  readonly pin: (version: string) => void;
  readonly unpin: () => void;
  readonly setAudience: (allMembers: boolean) => void;
  /** `none` clears the member's decision. */
  readonly decide: (memberId: string, choice: DecisionChoice) => void;
}

/** An administrator's gestures on one hook; each one reads the hook again, whether the server took it or not. */
export function useHookChange(name: string): HookChangeViewModel {
  const queryClient = useQueryClient();
  const path = { name };
  const change = useDeliveryChange(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listHooksQueryKey() }),
      queryClient.invalidateQueries({ queryKey: listHookVersionsQueryKey({ path }) }),
      queryClient.invalidateQueries({ queryKey: listHookAssignmentsQueryKey({ path }) }),
    ]);
  });
  return {
    pending: change.pending,
    failure: change.failure,
    pin: (version) => {
      change.run(async () => pinHook({ path, body: { version }, throwOnError: true }));
    },
    unpin: () => {
      change.run(async () => unpinHook({ path, throwOnError: true }));
    },
    setAudience: (allMembers) => {
      change.run(async () => setHookAudience({ path, body: { allMembers }, throwOnError: true }));
    },
    decide: (memberId, choice) => {
      change.run(async () =>
        choice === 'none'
          ? clearHookAssignment({ path: { name, memberId }, throwOnError: true })
          : setHookAssignment({ path: { name, memberId }, body: { decision: choice }, throwOnError: true }),
      );
    },
  };
}

export interface HookCodeViewModel {
  readonly artifact: HookArtifact | undefined;
  readonly failure: Error | undefined;
}

/** A version's definition and files, read (and checked against its digest by the server) before it is pinned. */
export function useHookCode(name: string, version: string): HookCodeViewModel {
  const code = useQuery(ready(readHookVersionOptions({ path: { name, version } })));
  return { artifact: code.data, failure: failureOf(code.error) };
}
