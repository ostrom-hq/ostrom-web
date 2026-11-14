// SPDX-License-Identifier: Apache-2.0
import {
  getInferenceSettingsOptions,
  getInferenceSettingsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import { setInferenceSettings } from '@gen/api/sdk.gen';
import type { InferenceSettings } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { concurrencyOf, withConcurrency } from './model';

/** The members' concurrent requests, once the organization's inference settings are read. */
export interface MemberConcurrencyLimits {
  readonly of: (memberId: string) => number;
  readonly set: (memberId: string, limit: number) => void;
}

export interface MemberConcurrencyViewModel {
  /**
   * Absent where the field is not offered (the server does not announce `inference.queue.v1`, the viewer does not
   * administer the organization, or its inference settings could not be read).
   */
  readonly limits: MemberConcurrencyLimits | undefined;
  /** The member whose limit is being saved. */
  readonly saving: string | undefined;
  readonly failure: Error | undefined;
}

interface Change {
  readonly memberId: string;
  readonly body: InferenceSettings;
}

/**
 * TeamCode's "Concurrent requests (0 = unlimited)" of a member: how many of the member's model calls run at once, the
 * next ones waiting in the admission queue. It lives in the organization's inference settings, which are written
 * whole: a change keeps the providers' keys and the other members' limits as they were read.
 */
export function useMemberConcurrency(role: OrgRole | undefined): MemberConcurrencyViewModel {
  const queryClient = useQueryClient();
  const offered = useAnnounced('inference.queue.v1') && managesMembers(role);
  const settings = useQuery(ready(getInferenceSettingsOptions(), { enabled: offered, retry: false }));
  const mutation = useMutation({
    mutationFn: async ({ body }: Change) => (await setInferenceSettings({ body, throwOnError: true })).data,
    onSettled: async () => queryClient.invalidateQueries({ queryKey: getInferenceSettingsQueryKey() }),
  });
  const { mutate } = mutation;
  const current = settings.data;
  const limits = useMemo(
    () =>
      current === undefined
        ? undefined
        : {
            of: (memberId: string) => concurrencyOf(current, memberId),
            set: (memberId: string, limit: number) => {
              mutate({ memberId, body: withConcurrency(current, memberId, limit) });
            },
          },
    [current, mutate],
  );
  return {
    limits,
    saving: mutation.isPending ? mutation.variables.memberId : undefined,
    failure: failureOf(mutation.error),
  };
}
