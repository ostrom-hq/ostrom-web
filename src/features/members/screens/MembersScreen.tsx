// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Facts, LoadState, Screen, Section } from '@/shared/ui/Screen';
import { InviteForm } from '../components/InviteForm';
import { MemberRow } from '../components/MemberRow';
import { useInvite, useMembers, useRoleChange } from '../useMembers';

export function MembersScreen(): ReactElement {
  const { t } = useTranslation();
  const view = useMembers();
  const roles = useRoleChange();
  const invite = useInvite();
  const org = view.organization;
  const leadOf = (count: number, via: string | undefined): string =>
    via === undefined ? t('members.count', { count }) : t('members.lead', { count, via });
  return (
    <Screen
      title={org?.name ?? t('members.title')}
      lead={
        view.members === undefined
          ? undefined
          : leadOf(
              view.members.filter((member) => member.role !== 'invited').length,
              org === undefined ? undefined : t(`members.via.${org.connectedVia}`),
            )
      }
    >
      {view.canManage ? <InviteForm invite={invite} /> : null}
      {roles.failure === undefined ? null : (
        <Banner tone="danger" tag={t('members.list.errorTag')} live>
          {roles.failure.message}
        </Banner>
      )}
      <LoadState data={view.members} failure={view.failure}>
        {(members) => (
          <section aria-labelledby="mb-people" className="o-stack">
            <h2 id="mb-people" className="o-label">
              {t('members.list.title')}
            </h2>
            <ul className="o-card o-rows">
              {members.map((member) => (
                <li key={member.login}>
                  <MemberRow
                    member={member}
                    isViewer={member.login === view.viewer}
                    saving={roles.saving === member.login}
                    onRole={
                      view.canManage && member.login !== view.viewer
                        ? (role) => {
                            roles.change(member.login, role);
                          }
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </LoadState>
      {view.teams === undefined || view.teams.length === 0 ? null : (
        <Section label={t('members.teams.title')}>
          <Facts
            facts={view.teams.map((team) => ({
              label: team.name,
              value: [
                t('members.teams.people', { count: team.members?.length ?? 0 }),
                ...(team.repos ?? []),
              ].join(' · '),
            }))}
          />
        </Section>
      )}
    </Screen>
  );
}
