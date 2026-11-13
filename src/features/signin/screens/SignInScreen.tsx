// SPDX-License-Identifier: AGPL-3.0-only
import { useSearch } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Screen } from '@/shared/ui/Screen';
import { SignInChoices } from '../components/SignInChoices';
import { signInErrorOf } from '../model';
import { useSignInMethods } from '../useSignIn';

/**
 * GitHub, or a link by e-mail. The session lands in a cookie no script reads; this page never sees a token. An
 * instance that is invite-only says so, and says why a sign-in it just refused (`?error=signup_closed`) was.
 */
export function SignInScreen(): ReactElement {
  const { t } = useTranslation();
  const { redirect, error } = useSearch({ from: '/signin' });
  const refusal = signInErrorOf(error);
  const { inviteOnly } = useSignInMethods();
  return (
    <Screen title={t('signin.title')} lead={t('signin.lead')}>
      {refusal === undefined ? null : (
        <Banner tone="warning" tag={t('signin.link.failedTag')} live>
          {t(`signin.error.${refusal}`)}
        </Banner>
      )}
      {inviteOnly ? <p className="o-row__meta">{t('signin.byInvitation')}</p> : null}
      <SignInChoices redirect={redirect} />
    </Screen>
  );
}
