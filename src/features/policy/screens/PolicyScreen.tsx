// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
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
        defaultModel={models.policy?.default ?? (models.failure === undefined ? undefined : null)}
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
