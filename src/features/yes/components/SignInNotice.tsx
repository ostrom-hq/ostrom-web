// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/auth/authStore';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';

/** What a sign-in link did when it could not simply sign in: not a token, or another account than this one. */
export function SignInNotice(): ReactElement | null {
  const { t } = useTranslation();
  const pending = useAuthStore((auth) => auth.pending);
  const notice = useAuthStore((auth) => auth.notice);
  const acceptPending = useAuthStore((auth) => auth.acceptPending);
  const dismiss = useAuthStore((auth) => auth.dismiss);
  if (pending === undefined && notice === undefined) return null;
  return (
    <Banner tone="warning" tag={t('yes.signin.tag')} live>
      <span className="ys-signin">
        <span>{pending === undefined ? t('yes.signin.invalid') : t('yes.signin.switch')}</span>
        <span className="ys-signin__actions">
          {pending === undefined ? null : <Button onClick={acceptPending}>{t('yes.signin.accept')}</Button>}
          <Button variant="ghost" onClick={dismiss}>
            {pending === undefined ? t('yes.signin.dismiss') : t('yes.signin.keep')}
          </Button>
        </span>
      </span>
    </Banner>
  );
}
