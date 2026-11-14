// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { SignInChoices } from '../components/SignInChoices';
import { useSetupLink } from '../useSignIn';

/**
 * `/setup#token=osb_…`, the link `ostrom-server bootstrap` prints: the token was taken from the fragment and wiped
 * before this renders. Once the server accepted it, the person picks how to sign in (the choices of the sign-in
 * page) and lands on the creation of their organization.
 */
export function SetupScreen(): ReactElement {
  const { t } = useTranslation();
  const { state, failure, retry } = useSetupLink();
  if (state === 'missing' || state === 'expired') {
    return (
      <Screen title={t('setup.title')}>
        <EmptyState title={t(`setup.${state}.title`)}>
          <p>{t(`setup.${state}.body`)}</p>
        </EmptyState>
      </Screen>
    );
  }
  if (state === 'granting') {
    return (
      <Screen title={t('setup.title')}>
        <p role="status">{t('setup.granting')}</p>
        <Skeleton rows={2} />
      </Screen>
    );
  }
  if (state === 'failed') {
    return (
      <Screen title={t('setup.title')}>
        <Banner tone="warning" tag={t('setup.failedTag')} live>
          {failure?.message}
        </Banner>
        <div>
          <Button variant="secondary" onClick={retry}>
            {t('setup.retry')}
          </Button>
        </div>
      </Screen>
    );
  }
  return (
    <Screen title={t('setup.title')} lead={t('setup.lead')}>
      <SignInChoices redirect="/" />
    </Screen>
  );
}
