// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { useSignInNotice } from '../useYes';

/** What a sign-in link did when it could not simply sign in: not a token, or another account than this one. */
export function SignInNotice(): ReactElement | null {
  const { t } = useTranslation();
  const { pending, invalid, accept, dismiss } = useSignInNotice();
  if (!pending && !invalid) return null;
  return (
    <Banner tone="warning" tag={t('yes.signin.tag')} live>
      <span className="ys-signin">
        <span>{pending ? t('yes.signin.switch') : t('yes.signin.invalid')}</span>
        <span className="ys-signin__actions">
          {pending ? <Button onClick={accept}>{t('yes.signin.accept')}</Button> : null}
          <Button variant="ghost" onClick={dismiss}>
            {pending ? t('yes.signin.keep') : t('yes.signin.dismiss')}
          </Button>
        </span>
      </span>
    </Banner>
  );
}
