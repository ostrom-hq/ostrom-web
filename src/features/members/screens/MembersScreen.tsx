// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgView } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { givableRoles, managesMembers, mayManage, type OrgRole, orgRoleOf } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { InvitationRow } from '../components/InvitationRow';
import { InviteForm } from '../components/InviteForm';
import { InviteLink } from '../components/InviteLink';
import { MemberRow } from '../components/MemberRow';
import { useInvite, useInviteLink, useMembers, useRevokeInvitation, useRoleChange } from '../useMembers';

export function MembersScreen(): ReactElement {
  const { t } = useTranslation();
  return <WithOrg title={t('members.title')}>{(org, role) => <MembersPage org={org} role={role} />}</WithOrg>;
}

function MembersPage({
  org,
  role,
}: {
  readonly org: OrgView;
  readonly role: OrgRole | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const view = useMembers(org.id, role);
  const changes = useRoleChange(org.id);
  const invite = useInvite(org.id);
  const link = useInviteLink(org.id);
  const revoke = useRevokeInvitation(org.id);
  const roles = givableRoles(role);
  const manager = managesMembers(role);
  const invitations = view.invitations ?? [];
  // The invitations that did not load, or the one that was not revoked: said in their section.
  const invitationsTrouble = view.invitationsFailure ?? revoke.failure;
  return (
    <Screen
      title={org.name}
      lead={
        view.members === undefined
          ? undefined
          : t('members.lead', {
              count: view.members.length,
              role: role === undefined ? org.role : t(`members.role.${role}`),
            })
      }
    >
      {manager ? <InviteForm invite={invite} roles={roles} /> : null}
      {manager ? <InviteLink link={link} roles={roles} /> : null}
      {changes.failure === undefined ? null : (
        <Banner tone="danger" tag={t('members.list.errorTag')} live>
          {changes.failure.message}
        </Banner>
      )}
      <LoadState data={view.members} failure={view.failure}>
        {(members) => (
          <section aria-labelledby="mb-people" className="o-stack">
            <h2 id="mb-people" className="o-label">
              {t('members.list.title')}
            </h2>
            <ul className="o-card o-rows">
              {members.map((member) => {
                const target = orgRoleOf(member.role);
                const editable =
                  member.login !== view.viewer && target !== undefined && mayManage(role, target);
                return (
                  <li key={member.login}>
                    <MemberRow
                      member={member}
                      isViewer={member.login === view.viewer}
                      saving={changes.saving === member.login}
                      roles={editable ? roles : []}
                      onRole={(next) => {
                        changes.change(member.login, next);
                      }}
                      onRemove={
                        editable
                          ? () => {
                              changes.remove(member.login);
                            }
                          : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </LoadState>
      {invitations.length === 0 && invitationsTrouble === undefined ? null : (
        <section aria-labelledby="mb-invitations" className="o-stack">
          <h2 id="mb-invitations" className="o-label">
            {t('members.invitations.title')}
          </h2>
          {invitationsTrouble === undefined ? null : (
            <Banner tone="danger" tag={t('members.list.errorTag')} live>
              {invitationsTrouble.message}
            </Banner>
          )}
          {invitations.length === 0 ? null : (
            <ul className="o-card o-rows">
              {invitations.map((invitation) => (
                <li key={invitation.id}>
                  <InvitationRow
                    invitation={invitation}
                    revoking={revoke.revoking === invitation.id}
                    onRevoke={() => {
                      revoke.revoke(invitation.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Screen>
  );
}
