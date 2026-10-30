// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement, ReactNode } from 'react';

export type BannerTone = 'info' | 'warning' | 'danger';

export interface BannerProps {
  readonly tone?: BannerTone;
  readonly tag: string;
  readonly children: ReactNode;
  /** `alert` interrupts screen readers: only for something that just happened. */
  readonly live?: boolean;
}

export function Banner({ tone = 'info', tag, children, live = false }: BannerProps): ReactElement {
  return (
    <div className={`o-banner o-banner--${tone}`} role={live ? 'alert' : undefined}>
      <span className="o-banner__tag">{tag}</span>
      <span>{children}</span>
    </div>
  );
}
