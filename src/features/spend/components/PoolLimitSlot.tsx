// SPDX-License-Identifier: Apache-2.0
import { lazy, type ReactElement, Suspense } from 'react';
import { useAnnounced } from '@/shared/capabilities';

// Asked for as soon as the page's code runs, not once the server's features are known: the pool size is then asked the
// moment they are, beside the page's other reads, instead of after the chunk has come (a chain of three calls).
const loading = import('@/features/poolSize');
const PoolLimit = lazy(async () => {
  const { PoolLimit: component } = await loading;
  return { default: component };
});

/** The organization's daily limit in force, from the pool size feature's chunk, shown only where it applies. */
export function PoolLimitSlot({ manages }: { readonly manages: boolean }): ReactElement | null {
  const served = useAnnounced('capacity.poolsize.v1');
  if (!served || !manages) return null;
  return (
    <Suspense fallback={null}>
      <PoolLimit />
    </Suspense>
  );
}
