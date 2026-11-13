// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from 'react';
import type { FeatureKey } from './model';
import { useFeature } from './useServerStatus';

export interface FeatureProps {
  readonly name: FeatureKey;
  readonly children: ReactNode;
  /** What shows where the server does not serve the feature; nothing by default. */
  readonly fallback?: ReactNode;
}

/** Shows `children` only where the server serves the feature `name`. */
export function Feature({ name, children, fallback = null }: FeatureProps): ReactElement {
  return <>{useFeature(name) ? children : fallback}</>;
}
