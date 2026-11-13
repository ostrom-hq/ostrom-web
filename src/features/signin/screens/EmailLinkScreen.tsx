// SPDX-License-Identifier: Apache-2.0
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
 * signed in on this browser is asked before the link replaces their session. A link opened in another browser than
 * the one that asked for it (the mail read on a phone) says why it is refused and offers a new link from here.
 */
export function EmailLinkScreen(): ReactElement {
  const { t } = useTranslation();
  const { state, failure, otherBrowser, closed, signedInAs, accept, keep } = useEmailLink();
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
              <Button
                variant="ghost"
                onClick={() => {
                  void keep();
                }}
              >
                {t('signin.link.keep')}
              </Button>
            </span>
          </span>
        </Banner>
      ) : (
        <Banner tone="warning" tag={t('signin.link.failedTag')} live>
          {otherBrowser
            ? t('signin.link.otherBrowser')
            : closed
              ? t('signin.error.signup_closed')
              : failure === undefined
                ? t('signin.link.missing')
                : failure.message}
        </Banner>
      )}
      {state === 'verifying' || state === 'asking' ? null : (
        <p>
          <Link to="/signin">{otherBrowser ? t('signin.link.againHere') : t('signin.link.again')}</Link>
        </p>
      )}
    </Screen>
  );
}
