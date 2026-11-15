// SPDX-License-Identifier: Apache-2.0
import {
  getPacingSettingsOptions,
  getPacingSettingsQueryKey,
  getPoolSizeOptions,
  getPoolSizeQueryKey,
  setPacingSettingsMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { PacingSettings, PoolSize } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

/** `GET /pools/size`: the automatic daily budget and the estimate behind it (owners and admins). */
export function usePoolSize(enabled: boolean): {
  readonly size: PoolSize | undefined;
  readonly failure: Error | undefined;
} {
  const query = useQuery(ready(getPoolSizeOptions(), { enabled, retry: false }));
  return { size: query.data, failure: failureOf(query.error) };
}

export interface PacingSettingsViewModel {
  readonly settings: PacingSettings | undefined;
  readonly failure: Error | undefined;
  /** Sends only the fields given (the others keep their stored value); `onDone` runs once the server took it. */
  readonly save: (change: PacingSettings, onDone: () => void) => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/** `GET`/`PUT /policy/pacing`: the capacity controller's settings. A write answers the settings now in force. */
export function usePacingSettings(enabled: boolean): PacingSettingsViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getPacingSettingsOptions(), { enabled, retry: false }));
  const saving = useMutation({
    ...setPacingSettingsMutation(),
    onSuccess: (settings) => {
      queryClient.setQueryData(getPacingSettingsQueryKey(), settings);
      // The daily budget in force follows the setting.
      void queryClient.invalidateQueries({ queryKey: getPoolSizeQueryKey() });
    },
  });
  const { mutate } = saving;
  return {
    settings: query.data,
    failure: failureOf(query.error),
    save: (change, onDone) => {
      mutate({ body: change }, { onSuccess: onDone });
    },
    saving: saving.isPending,
    saveFailure: failureOf(saving.error),
  };
}
