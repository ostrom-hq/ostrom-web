// SPDX-License-Identifier: AGPL-3.0-only
import type { Member } from '@gen/api/types.gen';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { ASSIGNABLE_ROLES, type AssignableRole, displayName } from '../model';

const TONES: Readonly<Record<Member['role'], BadgeTone>> = {
  owner: 'neutral',
  admin: 'neutral',
  approver: 'neutral',
  member: 'neutral',
  invited: 'warning',
};

export interface MemberRowProps {
  readonly member: Member;
  /** Present when the viewer may change this member's role. */
  readonly onRole: ((role: AssignableRole) => void) | undefined;
  readonly saving: boolean;
  readonly isViewer: boolean;
}

export function MemberRow({ member, onRole, saving, isViewer }: MemberRowProps): ReactElement {
  const { t } = useTranslation();
  const selectId = useId();
  const name = displayName(member);
  const meta = [
    member.login !== name ? `@${member.login}` : member.email === member.login ? undefined : member.email,
    ...(member.teams ?? []).map((team) => t('members.list.team', { team })),
  ].filter((part) => part !== undefined);
  return (
    <div className="o-row">
      <Avatar login={member.login} size={36} />
      <span className="o-row__main">
        <span className="o-row__title">
          {name}
          {isViewer ? <span className="o-row__meta"> {t('members.list.you')}</span> : null}
        </span>
        {meta.length === 0 ? null : <span className="o-row__meta">{meta.join(' · ')}</span>}
      </span>
      {onRole === undefined || member.role === 'invited' ? (
        <Badge tone={TONES[member.role]}>{t(`members.role.${member.role}`)}</Badge>
      ) : (
        <>
          <label htmlFor={selectId} className="o-visually-hidden">
            {t('members.list.roleOf', { name })}
          </label>
          <select
            id={selectId}
            className="o-input o-select"
            value={member.role}
            disabled={saving}
            onChange={(event) => {
              const role = ASSIGNABLE_ROLES.find((option) => option === event.target.value);
              if (role !== undefined) onRole(role);
            }}
          >
            {ASSIGNABLE_ROLES.map((option) => (
              <option key={option} value={option}>
                {t(`members.role.${option}`)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
