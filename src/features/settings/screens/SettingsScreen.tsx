// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgView } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { managesMembers, type OrgRole } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Screen } from '@/shared/ui/Screen';
import { DangerZone } from '../components/DangerZone';
import { GeneralSection } from '../components/GeneralSection';
import { SecuritySection } from '../components/SecuritySection';
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
  return (
    <Screen title={t('settings.title')} lead={t('settings.lead', { name: org.name })}>
      {/* A name changed here or elsewhere (another tab, another admin) starts the field again from it. */}
      <GeneralSection key={org.name} org={org} canRename={managesMembers(role)} rename={rename} />
      <SecuritySection view={sessions} actions={sessionActions} />
      <DangerZone org={org} isOwner={role === 'owner'} deletion={deletion} />
    </Screen>
  );
}
