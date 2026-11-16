// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { FailureText } from '@/shared/ui/FailureText';
import { poolRefusalOf } from '../model';

/** Why a pool write was refused: TeamCode's keys worded, any other failure as the server said it. */
export function SaveFailure({ failure }: { readonly failure: Error | undefined }): ReactElement | null {
  const { t } = useTranslation();
  if (failure === undefined) return null;
  const refusal = poolRefusalOf(failure);
  return (
    <Banner tone="danger" tag={t('capacity.errorTag')} live>
      {refusal === undefined ? <FailureText failure={failure} /> : t(`capacity.refusal.${refusal}`)}
    </Banner>
  );
}
