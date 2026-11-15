// SPDX-License-Identifier: Apache-2.0
import { getLaunchLimitsOptions, getLaunchLimitsQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { setLaunchLimits } from '@gen/api/sdk.gen';
import type { LaunchLimitsBody } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { useAnnounced } from '@/shared/capabilities';
import { managesMembers, type OrgRole } from '@/shared/org/roles';

export interface LaunchLimitsViewModel {
  /** Absent where the form is not offered, or until the limits are read. */
  readonly limits: LaunchLimitsBody | undefined;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly failure: Error | undefined;
  readonly save: (next: LaunchLimitsBody) => void;
}

/**
 * The limits of a session's launch (`launches.limits.v1`, TeamCode's run policy): an administrator caps what the
 * launch may spend, how many calls it runs at once, or pauses it; each applies from the launch's next model call.
 */
export function useLaunchLimits(
  launchId: string | undefined,
  role: OrgRole | undefined,
): LaunchLimitsViewModel {
  const queryClient = useQueryClient();
  const offered = useAnnounced('launches.limits.v1') && managesMembers(role) && typeof launchId === 'string';
  const path = { launchId: launchId ?? '' };
  const read = useQuery(ready(getLaunchLimitsOptions({ path }), { enabled: offered, retry: false }));
  const mutation = useMutation({
    mutationFn: async (body: LaunchLimitsBody) =>
      (await setLaunchLimits({ path, body, throwOnError: true })).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(getLaunchLimitsQueryKey({ path }), saved);
    },
  });
  return {
    limits: offered ? read.data : undefined,
    saving: mutation.isPending,
    saved: mutation.isSuccess,
    failure: failureOf(mutation.error),
    save: mutation.mutate,
  };
}
