// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export interface SkeletonProps {
  readonly rows?: number;
}

/** The shape of what is coming, not a spinner. */
export function Skeleton({ rows = 3 }: SkeletonProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="o-skeleton" role="status" aria-label={t('app.loading')}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="o-skeleton__row o-card" />
      ))}
    </div>
  );
}
