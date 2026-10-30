// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export interface SkeletonProps {
  readonly rows?: number;
}

/** The shape of what is coming, not a spinner. */
export function Skeleton({ rows = 3 }: SkeletonProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="ys-skeleton" role="status" aria-label={t('yes.queue.loading')}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ys-skeleton__row o-card" />
      ))}
    </div>
  );
}
