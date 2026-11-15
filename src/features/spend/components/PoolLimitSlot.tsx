// SPDX-License-Identifier: Apache-2.0
import { lazy, type ReactElement, Suspense } from 'react';
import { useAnnounced } from '@/shared/capabilities';

const PoolLimit = lazy(async () => {
  const { PoolLimit: component } = await import('@/features/poolSize');
  return { default: component };
});

/** The organization's daily limit in force, loaded with the pool size feature only where it is shown. */
export function PoolLimitSlot({ manages }: { readonly manages: boolean }): ReactElement | null {
  const served = useAnnounced('capacity.poolsize.v1');
  if (!served || !manages) return null;
  return (
    <Suspense fallback={null}>
      <PoolLimit />
    </Suspense>
  );
}
