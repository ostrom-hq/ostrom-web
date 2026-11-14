// SPDX-License-Identifier: Apache-2.0
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';

/** TeamCode's "How this works": what the screen does, folded away until the person wants it. */
export function Help({ children }: { readonly children: ReactNode }): ReactElement {
  const { t } = useTranslation();
  return (
    <details className="o-card dl-help">
      <summary>{t('delivery.help')}</summary>
      <p className="o-screen__lead">{children}</p>
    </details>
  );
}
