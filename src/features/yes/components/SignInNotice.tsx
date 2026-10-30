// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { useSignInNotice } from '../useYes';

/** What a sign-in link did when it could not simply sign in: not a token, refused, or maybe another account. */
export function SignInNotice(): ReactElement | null {
  const { t } = useTranslation();
  const { accept, invalid, signingIn, failure, dismiss } = useSignInNotice();
  const pending = accept !== undefined;
  if (failure !== undefined)
    return (
      <Banner tone="danger" tag={t('yes.signin.tag')} live>
        <span className="ys-signin">
          <span>{t('yes.signin.failed', { reason: failure.message })}</span>
          <span className="ys-signin__actions">
            <Button variant="ghost" onClick={dismiss}>
              {t('yes.signin.dismiss')}
            </Button>
          </span>
        </span>
      </Banner>
    );
  if (signingIn)
    return (
      <Banner tone="info" tag={t('yes.signin.tag')} live>
        {t('yes.signin.signingIn')}
      </Banner>
    );
  if (!pending && !invalid) return null;
  return (
    <Banner tone="warning" tag={t('yes.signin.tag')} live>
      <span className="ys-signin">
        <span>{pending ? t('yes.signin.switch') : t('yes.signin.invalid')}</span>
        <span className="ys-signin__actions">
          {accept === undefined ? null : <Button onClick={accept}>{t('yes.signin.accept')}</Button>}
          <Button variant="ghost" onClick={dismiss}>
            {pending ? t('yes.signin.keep') : t('yes.signin.dismiss')}
          </Button>
        </span>
      </span>
    </Banner>
  );
}
