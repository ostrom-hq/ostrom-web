// SPDX-License-Identifier: Apache-2.0
import {
  listSkillAssignmentsOptions,
  listSkillAssignmentsQueryKey,
  listSkillsOptions,
  listSkillsQueryKey,
  listSkillVersionsOptions,
  listSkillVersionsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import {
  clearSkillAssignment,
  pinSkill,
  promoteSkill,
  restoreSkill,
  retireSkill,
  retireSkillVersion,
  setSkillAssignment,
  setSkillAudience,
  unpinSkill,
} from '@gen/api/sdk.gen';
import type { OrgMember, SkillEntry, SkillVersion } from '@gen/api/types.gen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { type Decision, type DecisionChoice, decisionsById } from './model';
import { type DeliveryChange, useDeliveryChange } from './useDeliveryChange';
import { useCurrentOrgMembers } from '@/shared/org/useCurrentOrgMembers';
import type { OrgMembers } from '@/shared/org/members';

/** A skill a member published for themself: only they receive it, until an administrator promotes it. */
export function isPersonal(skill: SkillEntry): boolean {
  return skill.ownerId !== undefined && skill.ownerId !== null;
}

export interface SkillCatalogViewModel {
  /** Newest change first, as the server lists them. */
  readonly skills: readonly SkillEntry[] | undefined;
  /** To name the owner of a personal skill; absent if unreadable. */
  readonly members: readonly OrgMember[] | undefined;
  readonly failure: Error | undefined;
}

/** The organization's skills, team and personal: read by owners and admins only, as the server does. */
export function useSkillCatalog(): SkillCatalogViewModel {
  const catalog = useQuery(ready(listSkillsOptions()));
  // Only names: a refusal is not asked again, an owner then reads as their id.
  const members = useCurrentOrgMembers({ all: true });
  return { skills: catalog.data?.items, members: members.members, failure: failureOf(catalog.error) };
}

export interface SkillViewModel {
  readonly skill: SkillEntry | undefined;
  /** Newest first. */
  readonly versions: readonly SkillVersion[] | undefined;
  /** The explicit decisions by member id; absent until read, and for a personal skill, which has none. */
  readonly decisions: ReadonlyMap<string, Decision> | undefined;
  readonly members: readonly OrgMember[] | undefined;
  /** The next page of members, read when asked. */
  readonly people: Pick<OrgMembers, 'more' | 'loadingMore' | 'moreFailed'>;
  readonly failure: Error | undefined;
}

/** One skill with its versions and each member's decision. */
export function useSkill(name: string): SkillViewModel {
  const path = { name };
  const detail = useQuery(ready(listSkillVersionsOptions({ path })));
  const skill = detail.data?.skill;
  // A personal skill has no audience and no decisions: the server refuses them (409 `skill_personal`).
  const assignments = useQuery(
    ready(listSkillAssignmentsOptions({ path }), {
      enabled: skill !== undefined && !isPersonal(skill),
    }),
  );
  const members = useCurrentOrgMembers();
  const decisions = useMemo(
    () => (assignments.data === undefined ? undefined : decisionsById(assignments.data.items)),
    [assignments.data],
  );
  return {
    skill,
    versions: detail.data?.versions,
    decisions,
    members: members.members,
    people: { more: members.more, loadingMore: members.loadingMore, moreFailed: members.moreFailed },
    failure: failureOf(detail.error ?? assignments.error),
  };
}

export interface SkillChangeViewModel extends Pick<DeliveryChange, 'pending' | 'failure'> {
  readonly pin: (version: string) => void;
  readonly unpin: () => void;
  readonly setAudience: (allMembers: boolean) => void;
  readonly retire: () => void;
  readonly restore: () => void;
  readonly retireVersion: (version: string) => void;
  readonly promote: () => void;
  /** `none` clears the member's decision. */
  readonly decide: (memberId: string, choice: DecisionChoice) => void;
}

/** An administrator's gestures on one skill; each one reads the skill again, whether the server took it or not. */
export function useSkillChange(name: string): SkillChangeViewModel {
  const queryClient = useQueryClient();
  const path = { name };
  const change = useDeliveryChange(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listSkillsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: listSkillVersionsQueryKey({ path }) }),
      queryClient.invalidateQueries({ queryKey: listSkillAssignmentsQueryKey({ path }) }),
    ]);
  });
  return {
    pending: change.pending,
    failure: change.failure,
    pin: (version) => {
      change.run(async () => pinSkill({ path, body: { version }, throwOnError: true }));
    },
    unpin: () => {
      change.run(async () => unpinSkill({ path, throwOnError: true }));
    },
    setAudience: (allMembers) => {
      change.run(async () => setSkillAudience({ path, body: { allMembers }, throwOnError: true }));
    },
    retire: () => {
      change.run(async () => retireSkill({ path, throwOnError: true }));
    },
    restore: () => {
      change.run(async () => restoreSkill({ path, throwOnError: true }));
    },
    retireVersion: (version) => {
      change.run(async () => retireSkillVersion({ path: { name, version }, throwOnError: true }));
    },
    promote: () => {
      change.run(async () => promoteSkill({ path, throwOnError: true }));
    },
    decide: (memberId, choice) => {
      change.run(async () =>
        choice === 'none'
          ? clearSkillAssignment({ path: { name, memberId }, throwOnError: true })
          : setSkillAssignment({ path: { name, memberId }, body: { decision: choice }, throwOnError: true }),
      );
    },
  };
}
