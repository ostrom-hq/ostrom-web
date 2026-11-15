// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { managesMembers } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { EmptyState, LoadState, Screen } from '@/shared/ui/Screen';
import { PoolSizeReport } from '../components/PoolSizeReport';
import { SettingsSection } from '../components/SettingsSection';
import { usePoolSize } from '../usePoolSize';
import '../poolSize.css';

/**
 * TeamCode's automatic pool size page (`/dashboard/capacity/pool-size`) with the capacity controller's settings
 * (`/dashboard/agent-guidance`): the daily budget in force and how it was sized, and the two switches. Owners and
 * admins only.
 */
export function PoolSizeScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('poolSize.title')}>
      {(_org, role) => (managesMembers(role) ? <PoolSize /> : <AdminsOnly />)}
    </WithOrg>
  );
}

function AdminsOnly(): ReactElement {
  const { t } = useTranslation();
  return (
    <Screen title={t('poolSize.title')}>
      <EmptyState title={t('poolSize.adminsOnlyTitle')}>{t('poolSize.adminsOnly')}</EmptyState>
    </Screen>
  );
}

function PoolSize(): ReactElement {
  const { t } = useTranslation();
  const view = usePoolSize(true);
  return (
    <Screen title={t('poolSize.title')} lead={t('poolSize.lead')}>
      <SettingsSection />
      <LoadState data={view.size} failure={view.failure} rows={3}>
        {(size) => <PoolSizeReport size={size} />}
      </LoadState>
    </Screen>
  );
}
