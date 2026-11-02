// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Screen } from '@/shared/ui/Screen';
import { LaunchCheck } from '../components/LaunchCheck';
import { ModelsSection } from '../components/ModelsSection';
import { ProvidersSection } from '../components/ProvidersSection';
import { useLaunchCheck, useModelPolicy, useProviders } from '../usePolicy';
import './policy.css';

function PolicyBody({ role }: { readonly role: OrgRole | undefined }): ReactElement {
  const canChange = managesMembers(role);
  const models = useModelPolicy();
  const providers = useProviders(canChange);
  const check = useLaunchCheck(models.policy);
  return (
    <>
      <ModelsSection view={models} canChange={canChange} />
      <ProvidersSection view={providers} canChange={canChange} />
      <LaunchCheck
        check={check}
        defaultModel={models.failure === undefined ? models.policy?.default : null}
      />
    </>
  );
}

/** Which agents and models the organization runs, through which keys, and whether a launch would pass. */
export function PolicyScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('policy.title')}>
      {(_org, role) => (
        <Screen title={t('policy.title')} lead={t('policy.lead')}>
          <PolicyBody role={role} />
        </Screen>
      )}
    </WithOrg>
  );
}
