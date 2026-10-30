// SPDX-License-Identifier: AGPL-3.0-only
import type { Invitation } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { orgRoleOf } from '@/shared/org/roles';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';

export interface InvitationRowProps {
  readonly invitation: Invitation;
  readonly revoking: boolean;
  readonly onRevoke: () => void;
}

/** An invitation still waiting: to whom (or a link and its uses), as what, until when. */
export function InvitationRow({ invitation, revoking, onRevoke }: InvitationRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const role = orgRoleOf(invitation.role);
  const expires = new Date(invitation.expiresAt).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const title =
    invitation.email ??
    t('members.invitations.link', {
      uses: invitation.uses,
      max: invitation.maxUses ?? t('members.invitations.unlimited'),
    });
  return (
    <div className="o-row">
      <span className="o-row__main">
        <span className="o-row__title">{title}</span>
        <span className="o-row__meta">{t('members.invitations.expires', { date: expires })}</span>
      </span>
      <span className="o-row__end o-inline">
        <Badge tone="warning">{role === undefined ? invitation.role : t(`members.role.${role}`)}</Badge>
        <ConfirmButton
          label={t('members.invitations.revoke')}
          confirm={t('members.invitations.revokeConfirm')}
          keep={t('members.list.keep')}
          disabled={revoking}
          onConfirm={onRevoke}
        />
      </span>
    </div>
  );
}
