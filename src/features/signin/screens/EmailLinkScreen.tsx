// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { useEmailLink } from '../useSignIn';

/**
 * Where an e-mailed link lands: the token was taken from the fragment and wiped before this renders. Someone already
 * signed in on this browser is asked before the link replaces their session.
 */
export function EmailLinkScreen(): ReactElement {
  const { t } = useTranslation();
  const { state, failure, signedInAs, accept, keep } = useEmailLink();
  return (
    <Screen title={t('signin.link.title')}>
      {state === 'verifying' ? (
        <>
          <p role="status">{t('signin.link.verifying')}</p>
          <Skeleton rows={1} />
        </>
      ) : state === 'asking' ? (
        <Banner tone="warning" tag={t('signin.link.switchTag')} live>
          <span className="o-stack">
            <span>
              {signedInAs === undefined
                ? t('signin.link.switch')
                : t('signin.link.switchFrom', { name: signedInAs })}
            </span>
            <span className="o-inline">
              <Button onClick={accept}>{t('signin.link.accept')}</Button>
              <Button variant="ghost" onClick={keep}>
                {t('signin.link.keep')}
              </Button>
            </span>
          </span>
        </Banner>
      ) : (
        <Banner tone="warning" tag={t('signin.link.failedTag')} live>
          {failure === undefined ? t('signin.link.missing') : failure.message}
        </Banner>
      )}
      {state === 'verifying' || state === 'asking' ? null : (
        <p>
          <Link to="/signin">{t('signin.link.again')}</Link>
        </p>
      )}
    </Screen>
  );
}
