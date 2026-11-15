// SPDX-License-Identifier: Apache-2.0
import {
  getApiPricesOptions,
  getApiPricesQueryKey,
  loadApiPriceDefaultsMutation,
  setApiPricesMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { ApiPrice, ApiPriceTable } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

export interface ApiPricesViewModel {
  /** The organization's table, or the built-in prices when it has none (`defaults`); undefined until read. */
  readonly table: ApiPriceTable | undefined;
  readonly failure: Error | undefined;
  /** Replaces the whole table; `onDone` runs once the server took it. */
  readonly save: (prices: readonly ApiPrice[], onDone: () => void) => void;
  /** Adds Anthropic's list prices the table lacks. */
  readonly loadDefaults: () => void;
  readonly saving: boolean;
  readonly saveFailure: Error | undefined;
}

/**
 * `GET`/`PUT /policy/api-prices` and `POST …/load-defaults`: the table the gateway prices the organization's model
 * calls with. Every write answers the whole table, which replaces the one on screen.
 */
export function useApiPrices(enabled: boolean): ApiPricesViewModel {
  const queryClient = useQueryClient();
  const query = useQuery(ready(getApiPricesOptions(), { enabled, retry: false }));
  const onSuccess = (table: ApiPriceTable): void => {
    queryClient.setQueryData(getApiPricesQueryKey(), table);
  };
  const saving = useMutation({ ...setApiPricesMutation(), onSuccess });
  const loading = useMutation({ ...loadApiPriceDefaultsMutation(), onSuccess });
  const { mutate: saveMutate, reset: resetSave } = saving;
  const { mutate: loadMutate, reset: resetLoad } = loading;
  const save = useCallback(
    (prices: readonly ApiPrice[], onDone: () => void) => {
      resetLoad();
      saveMutate({ body: { prices: [...prices] } }, { onSuccess: onDone });
    },
    [saveMutate, resetLoad],
  );
  const loadDefaults = useCallback(() => {
    resetSave();
    loadMutate({});
  }, [loadMutate, resetSave]);
  return {
    table: query.data,
    failure: failureOf(query.error),
    save,
    loadDefaults,
    saving: saving.isPending || loading.isPending,
    saveFailure: failureOf(saving.error ?? loading.error),
  };
}
