// SPDX-License-Identifier: Apache-2.0
import type { OrgView } from '@gen/api/types.gen';
import { Link } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import type { OrgRole } from '@/shared/org/roles';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { EmptyState, Screen } from '@/shared/ui/Screen';
import { Skeleton } from '@/shared/ui/Skeleton';
import { CreateOrgForm } from '../components/CreateOrgForm';
import { SetupGuide } from '../components/SetupGuide';
import { useCreateOrg, useHome, useSetup } from '../useOnboarding';
import './onboarding.css';

/**
 * The first screen after signing up: who is signed in decides. Nobody: sign in. A person in no organization creates
 * one. In one: the setup guide, until it is put away.
 */
export function HomeScreen(): ReactElement {
  const { t } = useTranslation();
  const home = useHome();
  const current = useCurrentOrg();
  const create = useCreateOrg();
  if (home.signedOut) {
    return (
      <Screen title={t('home.title')} lead={t('home.lead')}>
        <div>
          <Link to="/signin" className="o-btn o-btn--secondary o-btn--md">
            {t('home.signIn')}
          </Link>
        </div>
      </Screen>
    );
  }
  if (current.none) {
    return (
      <Screen title={t('onboarding.create.title')} lead={t('onboarding.create.lead')}>
        <CreateOrgForm org={create} />
        <p className="o-row__meta">{t('onboarding.create.invited')}</p>
      </Screen>
    );
  }
  if (current.org !== undefined)
    return <OrgHome key={current.org.id} org={current.org} role={current.role} />;
  return (
    <Screen title={t('home.title')}>
      {current.choosing ? (
        <EmptyState title={t('orgs.gate.chooseTitle')}>
          <Button onClick={current.choose}>{t('orgs.switch.choose')}</Button>
        </EmptyState>
      ) : home.failure === undefined ? (
        <Skeleton rows={4} />
      ) : (
        <Banner tone="warning" tag={t('app.failure.tag')}>
          {home.failure.message}
        </Banner>
      )}
    </Screen>
  );
}

function OrgHome({ org, role }: { readonly org: OrgView; readonly role: OrgRole | undefined }): ReactElement {
  const { t } = useTranslation();
  const setup = useSetup(org.id, role);
  return (
    <Screen title={org.name} lead={t('onboarding.guide.lead')}>
      {setup.hidden ? (
        <div>
          <Button variant="ghost" onClick={setup.show}>
            {t('onboarding.guide.show')}
          </Button>
        </div>
      ) : (
        <SetupGuide setup={setup} />
      )}
    </Screen>
  );
}
