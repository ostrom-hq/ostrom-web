// SPDX-License-Identifier: Apache-2.0
import {
  listMyEnvironmentVariantsOptions,
  listMyEnvironmentVariantsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import {
  createMyEnvironmentVariant,
  deleteMyEnvironmentVariant,
  getEnvironment,
  updateMyEnvironmentVariant,
} from '@gen/api/sdk.gen';
import type { EnvironmentVariant, EnvironmentVariantCreate } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';

/** What the person's agents receive, by name only. */
export interface ReceivedNames {
  /** The variables their agents are given, sorted. */
  readonly names: readonly string[];
  /** Assigned variables withheld because their value cannot be read now. */
  readonly unavailable: readonly string[];
}

/** The cache key of the names: never the generated one, which would hold the values. */
const RECEIVED_KEY = ['environment', 'received-names'] as const;

/**
 * Reads `GET /environment` and keeps only the names: the values are dropped as soon as they arrive, so they are never
 * cached, rendered or kept in memory by the console.
 */
export async function receivedNames(): Promise<ReceivedNames> {
  const { data } = await getEnvironment({ throwOnError: true });
  return { names: Object.keys(data.variables).toSorted(), unavailable: data.unavailable.toSorted() };
}

export interface MyEnvironmentViewModel {
  readonly received: ReceivedNames | undefined;
  readonly receivedFailure: Error | undefined;
  /** The person's own variants, assigned to them alone. */
  readonly variants: readonly EnvironmentVariant[] | undefined;
  readonly failure: Error | undefined;
}

export function useMyEnvironment(): MyEnvironmentViewModel {
  const received = useQuery({ queryKey: RECEIVED_KEY, queryFn: receivedNames, retry: false });
  const variants = useQuery(ready(listMyEnvironmentVariantsOptions()));
  return {
    received: received.data,
    receivedFailure: failureOf(received.error),
    variants: variants.data?.items,
    failure: failureOf(variants.error),
  };
}

export interface MyEnvironmentChangeViewModel {
  readonly create: (body: EnvironmentVariantCreate, onDone: () => void) => void;
  readonly update: (
    variant: EnvironmentVariant,
    change: { readonly name: string; readonly value: string; readonly expectedVersion: number },
    onDone: () => void,
  ) => void;
  readonly remove: (variant: EnvironmentVariant) => void;
  readonly pending: boolean;
  readonly failure: Error | undefined;
}

/** The person's writes on their own variants; each reads the variants and the received names again. */
export function useMyEnvironmentChange(): MyEnvironmentChangeViewModel {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all(
      [listMyEnvironmentVariantsQueryKey(), RECEIVED_KEY].map(async (queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient]);
  // A value rides in the write only: the mutation is forgotten as soon as it settles.
  const write = useMutation({
    mutationFn: async (call: () => Promise<unknown>) => call(),
    gcTime: 0,
    onSettled: refresh,
  });
  const { mutate, reset } = write;
  const run = useCallback(
    (call: () => Promise<unknown>, onDone?: () => void) => {
      reset();
      mutate(call, {
        onSuccess: () => {
          reset();
          onDone?.();
        },
      });
    },
    [mutate, reset],
  );
  return {
    create: (body, onDone) => {
      // A personal variant is always shared: one value, the person's own.
      run(
        async () => createMyEnvironmentVariant({ body: { ...body, binding: 'shared' }, throwOnError: true }),
        onDone,
      );
    },
    update: (variant, change, onDone) => {
      const name = change.name.trim();
      run(
        async () =>
          updateMyEnvironmentVariant({
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
      run(async () => deleteMyEnvironmentVariant({ path: { id: variant.id }, throwOnError: true }));
    },
    pending: write.isPending,
    failure: failureOf(write.error),
  };
}
