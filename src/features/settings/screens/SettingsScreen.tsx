// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgView } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Screen } from '@/shared/ui/Screen';
import { DangerZone } from '../components/DangerZone';
import { DevicesSection } from '../components/DevicesSection';
import { GeneralSection } from '../components/GeneralSection';
import { SecuritySection } from '../components/SecuritySection';
import { ServiceKeysSection } from '../components/ServiceKeysSection';
import { useDevices, useServiceKeys } from '../useKeysAndDevices';
import { useAuthSessions, useDeleteOrg, useRenameOrg, useSessionActions } from '../useSettings';
import './settings.css';

export function SettingsScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('settings.title')}>
      {(org, role) => <SettingsPage key={org.id} org={org} role={role} />}
    </WithOrg>
  );
}

function SettingsPage({
  org,
  role,
}: {
  readonly org: OrgView;
  readonly role: OrgRole | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const rename = useRenameOrg(org);
  const deletion = useDeleteOrg(org);
  const sessions = useAuthSessions();
  const sessionActions = useSessionActions();
  const devices = useDevices();
  const manages = managesMembers(role);
  const serviceKeys = useServiceKeys(manages);
  return (
    <Screen title={t('settings.title')} lead={t('settings.lead', { name: org.name })}>
      <GeneralSection org={org} canRename={manages} rename={rename} />
      <SecuritySection view={sessions} actions={sessionActions} back="/settings" />
      <DevicesSection view={devices} />
      <ServiceKeysSection orgName={org.name} manages={manages} view={serviceKeys} />
      <DangerZone org={org} isOwner={role === 'owner'} deletion={deletion} />
    </Screen>
  );
}
