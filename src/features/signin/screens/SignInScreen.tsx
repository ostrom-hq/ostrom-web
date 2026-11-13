// SPDX-License-Identifier: AGPL-3.0-only
import { useSearch } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Screen } from '@/shared/ui/Screen';
import { SignInChoices } from '../components/SignInChoices';
import { useSignInMethods } from '../useSignIn';

/**
 * GitHub, or a link by e-mail. The session lands in a cookie no script reads; this page never sees a token. An
 * instance that is invite-only says so, and says why a sign-in it just refused (`?error=signup_closed`) was.
 */
export function SignInScreen(): ReactElement {
  const { t } = useTranslation();
  const { redirect, error } = useSearch({ from: '/signin' });
  const { inviteOnly } = useSignInMethods();
  return (
    <Screen title={t('signin.title')} lead={t('signin.lead')}>
      {error === 'signup_closed' ? (
        <Banner tone="warning" tag={t('signin.closed.tag')} live>
          {t('signin.closed.refused')}
        </Banner>
      ) : null}
      {inviteOnly ? <p className="o-row__meta">{t('signin.closed.byInvitation')}</p> : null}
      <SignInChoices redirect={redirect} />
    </Screen>
  );
}
