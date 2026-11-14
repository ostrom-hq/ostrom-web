// SPDX-License-Identifier: Apache-2.0
import {
  listMySkillsOptions,
  listMySkillsQueryKey,
  listMySkillVersionsOptions,
  listMySkillVersionsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { pinMySkill, restoreMySkill, retireMySkill, unpinMySkill } from '@gen/api/sdk.gen';
import type { SkillEntry, SkillVersion } from '@gen/api/types.gen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { type DeliveryChange, useDeliveryChange } from './useDeliveryChange';

export interface PersonalSkillsViewModel {
  /** The caller's own skills, newest change first. */
  readonly skills: readonly SkillEntry[] | undefined;
  readonly failure: Error | undefined;
}

export function usePersonalSkills(): PersonalSkillsViewModel {
  const skills = useQuery(ready(listMySkillsOptions()));
  return { skills: skills.data?.items, failure: failureOf(skills.error) };
}

export interface PersonalVersionsViewModel {
  readonly versions: readonly SkillVersion[] | undefined;
  readonly failure: Error | undefined;
}

/** One personal skill's versions, read once the person opens them. */
export function usePersonalVersions(name: string): PersonalVersionsViewModel {
  const detail = useQuery(ready(listMySkillVersionsOptions({ path: { name } })));
  return { versions: detail.data?.versions, failure: failureOf(detail.error) };
}

export interface PersonalChangeViewModel extends Pick<DeliveryChange, 'pending' | 'failure'> {
  readonly pin: (name: string, version: string) => void;
  readonly unpin: (name: string) => void;
  readonly retire: (name: string) => void;
  readonly restore: (name: string) => void;
}

/**
 * The person's gestures on their own skills (`names`: the ones on screen); each one reads the lists again, whether the
 * server took it or not.
 */
export function usePersonalChange(names: readonly string[]): PersonalChangeViewModel {
  const queryClient = useQueryClient();
  const change = useDeliveryChange(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listMySkillsQueryKey() }),
      ...names.map(async (name) =>
        queryClient.invalidateQueries({ queryKey: listMySkillVersionsQueryKey({ path: { name } }) }),
      ),
    ]);
  });
  return {
    pending: change.pending,
    failure: change.failure,
    pin: (name, version) => {
      change.run(async () => pinMySkill({ path: { name }, body: { version }, throwOnError: true }));
    },
    unpin: (name) => {
      change.run(async () => unpinMySkill({ path: { name }, throwOnError: true }));
    },
    retire: (name) => {
      change.run(async () => retireMySkill({ path: { name }, throwOnError: true }));
    },
    restore: (name) => {
      change.run(async () => restoreMySkill({ path: { name }, throwOnError: true }));
    },
  };
}
