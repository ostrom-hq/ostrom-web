// SPDX-License-Identifier: Apache-2.0
import {
  getWorkflowSettingsOptions,
  getWorkflowSettingsQueryKey,
  saveWorkflowSettingsMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { WorkflowEditors } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface WorkflowEditorsViewModel {
  /** Who decides workflows now; undefined until the settings are read. */
  readonly editors: WorkflowEditors | undefined;
  readonly failure: Error | undefined;
  readonly save: (editors: WorkflowEditors, onDone: () => void) => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/** `GET`/`PUT /workflows/settings`: the rule that says who accepts, edits and deletes workflows. */
export function useWorkflowEditors(enabled: boolean): WorkflowEditorsViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getWorkflowSettingsOptions(), { enabled, retry: false }));
  const mutation = useMutation({
    ...saveWorkflowSettingsMutation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getWorkflowSettingsQueryKey() });
    },
  });
  const { mutate } = mutation;
  return {
    editors: query.data?.editors,
    failure: failureOf(query.error),
    save: (editors, onDone) => {
      mutate({ body: editors }, { onSuccess: onDone });
    },
    saving: mutation.isPending,
    saveFailure: failureOf(mutation.error),
  };
}
