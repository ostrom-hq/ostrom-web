// SPDX-License-Identifier: Apache-2.0
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { type ReactElement, useEffect } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { GroupLending } from '../components/GroupLending';
import { GroupMembers } from '../components/GroupMembers';
import { GroupSettings } from '../components/GroupSettings';
import { useGroup, useGroupChange } from '../useGroups';
import './sharing.css';

/** One group: who is in it and who is paused, what it lends; an owner's or an admin's gestures on it. */
export function GroupScreen(): ReactElement {
  const { t } = useTranslation();
  const { groupId } = useParams({ from: '/accounts/groups/$groupId' });
  const view = useGroup(groupId);
  const change = useGroupChange();
  const navigate = useNavigate();
  const { gone } = view;
  // Deleted meanwhile, or of another organization: back to the list, which says so.
  useEffect(() => {
    if (gone) void navigate({ to: '/accounts/groups', search: { gone: true }, replace: true });
  }, [gone, navigate]);
  const writes = view.canManage ? change : undefined;
  return (
    <LoadState data={view.group} failure={gone ? undefined : view.failure} rows={2}>
      {(group) => (
        <Screen
          top={
            <Link to="/accounts/groups" className="o-back">
              {t('sharing.groups.back')}
            </Link>
          }
          title={group.name}
          lead={t('sharing.groups.memberCount', { count: group.members.length })}
        >
          {change.failure === undefined ? null : (
            <Banner tone="danger" tag={t('sharing.errorTag')} live>
              {change.failure.message}
            </Banner>
          )}
          <GroupMembers group={group} members={view.members} people={view.people} change={writes} />
          <GroupLending group={group} accounts={view.accounts} change={writes} />
          {writes === undefined ? (
            <p className="o-row__meta">{t('sharing.groups.readOnly')}</p>
          ) : (
            <GroupSettings
              // Renamed elsewhere meanwhile: the field starts again from the new name.
              key={group.name}
              group={group}
              change={writes}
              onDeleted={() => {
                void navigate({ to: '/accounts/groups' });
              }}
            />
          )}
        </Screen>
      )}
    </LoadState>
  );
}
