// SPDX-License-Identifier: Apache-2.0
import { useSearch } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { GroupCard } from '../components/GroupCard';
import { GroupForm } from '../components/GroupForm';
import { SharingTabs } from '../components/SharingTabs';
import { useGroupChange, useGroups } from '../useGroups';
import './sharing.css';

/** The groups the organization lends subscriptions to; an owner or an admin creates one here. */
export function GroupsScreen(): ReactElement {
  const { t } = useTranslation();
  const { gone } = useSearch({ from: '/accounts/groups' });
  const view = useGroups();
  const change = useGroupChange();
  return (
    <Screen top={<SharingTabs />} title={t('sharing.groups.title')} lead={t('sharing.groups.lead')}>
      {gone === true ? (
        <Banner tone="warning" tag={t('sharing.groups.goneTag')}>
          {t('sharing.groups.gone')}
        </Banner>
      ) : null}
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('sharing.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {!view.canManage || view.members === undefined ? null : (
        <GroupForm
          change={change}
          members={view.members}
          people={view.people}
          accounts={view.accounts ?? []}
        />
      )}
      <LoadState data={view.groups} failure={view.failure}>
        {(groups) =>
          groups.length === 0 ? (
            <p className="o-empty">{t('sharing.groups.empty')}</p>
          ) : (
            <div className="o-stack">
              {groups.map((group) => (
                <GroupCard key={group.id} group={group} accounts={view.accounts ?? []} />
              ))}
            </div>
          )
        }
      </LoadState>
    </Screen>
  );
}
