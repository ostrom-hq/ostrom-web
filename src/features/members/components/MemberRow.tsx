// SPDX-License-Identifier: Apache-2.0
import type { OrgMember } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OrgRole, orgRoleOf } from '@/shared/org/roles';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { concurrencyDraft, displayName, MAX_MEMBER_CONCURRENCY } from '../model';

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
  /** The member's concurrent requests, for an administrator where the server has the admission queue. */
  readonly concurrency?: ConcurrencyField | undefined;
}

export interface ConcurrencyField {
  /** 0 for unlimited. */
  readonly limit: number;
  readonly saving: boolean;
  /** The id of the sentence that says what the field does, written once for the list. */
  readonly hintId: string;
  readonly onChange: (limit: number) => void;
}

/**
 * TeamCode's "Concurrent requests (0 = unlimited)", saved when the field is left (or Enter): a value out of 0 to 32
 * goes back to the one saved.
 */
function ConcurrencyInput({
  name,
  field,
}: {
  readonly name: string;
  readonly field: ConcurrencyField;
}): ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(field.limit));
  return (
    // One label around the field, as the Stop hook's: a hundred people stay within the page's budget of DOM nodes.
    <label className="o-inline">
      {t('members.list.concurrency')}
      <input
        type="number"
        className="o-input"
        min={0}
        max={MAX_MEMBER_CONCURRENCY}
        step={1}
        value={draft}
        disabled={field.saving}
        aria-label={t('members.list.concurrencyOf', { name })}
        aria-describedby={field.hintId}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={() => {
          const limit = concurrencyDraft(draft);
          if (limit !== undefined && limit !== field.limit) field.onChange(limit);
          else setDraft(String(field.limit));
        }}
      />
    </label>
  );
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
  concurrency,
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
        {concurrency === undefined ? null : (
          // A saved limit starts the field again from it.
          <ConcurrencyInput key={concurrency.limit} name={name} field={concurrency} />
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
