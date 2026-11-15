// SPDX-License-Identifier: Apache-2.0
import {
  getMemoryCurationOptions,
  getMemoryCurationQueryKey,
  setMemoryCurationMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { MemoryCuration } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface MemoryCurationViewModel {
  /** Whether the organization's memory is curated and what the last run did; undefined until read. */
  readonly curation: MemoryCuration | undefined;
  readonly failure: Error | undefined;
  readonly save: (enabled: boolean) => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/** `GET`/`PUT /memory/curation`: the organization's memory curation, on or off (off until an administrator says). */
export function useMemoryCuration(enabled: boolean): MemoryCurationViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getMemoryCurationOptions(), { enabled, retry: false }));
  const mutation = useMutation({
    ...setMemoryCurationMutation(),
    onSuccess: async (saved) => {
      queryClient.setQueryData(getMemoryCurationQueryKey(), saved);
      await queryClient.invalidateQueries({ queryKey: getMemoryCurationQueryKey() });
    },
  });
  const { mutate } = mutation;
  return {
    curation: query.data,
    failure: failureOf(query.error),
    save: (next) => {
      mutate({ body: { enabled: next } });
    },
    saving: mutation.isPending,
    saveFailure: failureOf(mutation.error),
  };
}
