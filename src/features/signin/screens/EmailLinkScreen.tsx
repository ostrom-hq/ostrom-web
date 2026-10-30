// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { useEmailLink } from '../useSignIn';

/** Where an e-mailed link lands: the token was taken from the fragment and wiped before this renders. */
export function EmailLinkScreen(): ReactElement {
  const { t } = useTranslation();
  const { state, failure } = useEmailLink();
  return (
    <Screen title={t('signin.link.title')}>
      {state === 'verifying' ? (
        <>
          <p role="status">{t('signin.link.verifying')}</p>
          <Skeleton rows={1} />
        </>
      ) : (
        <Banner tone="warning" tag={t('signin.link.failedTag')} live>
          {failure === undefined ? t('signin.link.missing') : failure.message}
        </Banner>
      )}
      {state === 'verifying' ? null : (
        <p>
          <Link to="/signin">{t('signin.link.again')}</Link>
        </p>
      )}
    </Screen>
  );
}
