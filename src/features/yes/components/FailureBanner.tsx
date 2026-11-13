// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
import { isRefusal } from '@/shared/api/poll';
import { Banner } from '@/shared/ui/Banner';

/**
 * Says what the failure means for the person: signed out (open the link again), refused (the server's words, no
 * retrying), or offline (retrying). Never "offline" for a refusal.
 */
export function FailureBanner({
  failure,
}: {
  readonly failure: ApiFailure | Error | undefined;
}): ReactElement | null {
  const { t } = useTranslation();
  if (failure === undefined) return null;
  if (isApiFailure(failure) && failure.kind === 'unauthorized')
    return (
      <Banner tone="warning" tag={t('yes.failure.signedOutTag')} live>
        {t('yes.failure.signedOut')}
      </Banner>
    );
  if (isRefusal(failure))
    return (
      <Banner tone="danger" tag={t('yes.failure.refusedTag')} live>
        {failure.message}
      </Banner>
    );
  return (
    <Banner tone="warning" tag={t('yes.queue.offlineTag')}>
      {t('yes.queue.offline', { reason: failure.message })}
    </Banner>
  );
}
