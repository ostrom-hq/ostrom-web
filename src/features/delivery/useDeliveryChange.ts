// SPDX-License-Identifier: Apache-2.0
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { failureOf } from '@/shared/api/failureOf';

export interface DeliveryChange {
  /** Runs one write of the catalog; the lists it changed are read again once it is settled. */
  readonly run: (call: () => Promise<unknown>) => void;
  /** A write is on its way. */
  readonly pending: boolean;
  /** Why the last write was refused; a new gesture clears it. */
  readonly failure: Error | undefined;
}

/**
 * The catalog's writes of one screen, one at a time: they share a pending flag and a failure, so a screen says one thing
 * about what it is saving. `refresh` reads again what a write changes, whether it succeeded or not.
 */
export function useDeliveryChange(refresh: () => Promise<void>): DeliveryChange {
  const write = useMutation({
    mutationFn: async (call: () => Promise<unknown>) => call(),
    onSettled: refresh,
  });
  const { mutate, reset } = write;
  const run = useCallback(
    (call: () => Promise<unknown>) => {
      reset();
      mutate(call);
    },
    [mutate, reset],
  );
  return { run, pending: write.isPending, failure: failureOf(write.error) };
}
