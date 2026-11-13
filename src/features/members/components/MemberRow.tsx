// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgMember } from '@gen/api/types.gen';
import { type ReactElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrgRole, orgRoleOf } from '@/shared/org/roles';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { displayName } from '../model';

export interface MemberRowProps {
  readonly member: OrgMember;
  /** The roles the viewer can give this member; empty when they cannot change it. */
  readonly roles: readonly OrgRole[];
  readonly onRole: (role: OrgRole) => void;
  /** Present when the viewer may remove this member. */
  readonly onRemove: (() => void) | undefined;
  readonly saving: boolean;
  readonly isViewer: boolean;
  /** The member's todo Stop hook switch, for an administrator where the server has todos. */
  readonly stopHook?: StopHookSwitch | undefined;
}

export interface StopHookSwitch {
  readonly enabled: boolean;
  readonly saving: boolean;
  /** The id of the sentence that says what the switch does, written once for the list. */
  readonly hintId: string;
  readonly onChange: (enabled: boolean) => void;
}

export function MemberRow({
  member,
  roles,
  onRole,
  onRemove,
  saving,
  isViewer,
  stopHook,
}: MemberRowProps): ReactElement {
  const { t } = useTranslation();
  const selectId = useId();
  const name = displayName(member);
  const role = orgRoleOf(member.role);
  // The login under a name; without a name, the login is the title and the address (if any) says who it is.
  const meta = member.login === name ? member.email : `@${member.login}`;
  const label = role === undefined ? member.role : t(`members.role.${role}`);
  return (
    <div className="o-row">
      <Avatar login={member.login} size={36} />
      <span className="o-row__main">
        <span className="o-row__title">
          {name}
          {isViewer ? <span className="o-row__meta"> {t('members.list.you')}</span> : null}
        </span>
        {meta === null ? null : <span className="o-row__meta">{meta}</span>}
        {stopHook === undefined ? null : (
          // One label around the box: a list of a hundred people stays within the page's budget of DOM nodes.
          <label className="o-inline">
            <input
              type="checkbox"
              checked={stopHook.enabled}
              disabled={stopHook.saving}
              aria-label={t('members.list.todoHookOf', { name })}
              aria-describedby={stopHook.hintId}
              onChange={(event) => {
                stopHook.onChange(event.target.checked);
              }}
            />
            {t('members.list.todoHook')}
          </label>
        )}
      </span>
      <span className="o-row__end o-inline">
        {roles.length === 0 || role === undefined ? (
          <Badge>{label}</Badge>
        ) : (
          <>
            <label htmlFor={selectId} className="o-visually-hidden">
              {t('members.list.roleOf', { name })}
            </label>
            <select
              id={selectId}
              className="o-input o-select"
              value={role}
              disabled={saving}
              onChange={(event) => {
                const chosen = roles.find((option) => option === event.target.value);
                if (chosen !== undefined) onRole(chosen);
              }}
            >
              {roles.map((option) => (
                <option key={option} value={option}>
                  {t(`members.role.${option}`)}
                </option>
              ))}
            </select>
          </>
        )}
        {onRemove === undefined ? null : (
          <ConfirmButton
            label={t('members.list.remove')}
            confirm={t('members.list.removeConfirm', { name })}
            keep={t('members.list.keep')}
            disabled={saving}
            onConfirm={onRemove}
          />
        )}
      </span>
    </div>
  );
}
