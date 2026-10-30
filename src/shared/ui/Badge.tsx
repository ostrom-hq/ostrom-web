// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement, ReactNode } from 'react';

/** `signal` (garnet) is reserved for "a human is awaited"; amber warns, red refuses, green confirms. */
export type BadgeTone = 'neutral' | 'signal' | 'warning' | 'success' | 'danger';

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps): ReactElement {
  return <span className={`o-badge o-badge--${tone}`}>{children}</span>;
}
