// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceAdmin } from '@/shared/auth/useInstanceAdmin';
import { WithOrg } from '@/shared/org/WithOrg';
import { Screen } from '@/shared/ui/Screen';
import { ClustersSection } from '../components/ClustersSection';
import { ProfilesSection } from '../components/ProfilesSection';
import { RuntimeSection } from '../components/RuntimeSection';
import { SettingsSection } from '../components/SettingsSection';

/**
 * Cloud administration, as TeamCode's `/dashboard/cloud`: the organization's settings and profiles, and, for a person
 * who administers the instance, how sessions run and the clusters they run on.
 */
export function CloudAdminScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('cloudAdmin.title')}>
      {(org) => (
        <Screen title={t('cloudAdmin.title')} lead={t('cloudAdmin.lead')}>
          <SettingsSection />
          <ProfilesSection orgId={org.id} />
          <InstanceSections />
        </Screen>
      )}
    </WithOrg>
  );
}

/** The instance's own sections: asked of the server only for an administrator of the instance. */
function InstanceSections(): ReactElement | null {
  return useInstanceAdmin() === true ? (
    <>
      <RuntimeSection />
      <ClustersSection />
    </>
  ) : null;
}
