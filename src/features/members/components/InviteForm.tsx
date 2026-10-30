// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { INVITABLE_ROLES, type InvitableRole, parseInvites } from '../model';
import type { InviteViewModel } from '../useMembers';

function isInvitable(value: string): value is InvitableRole {
  return INVITABLE_ROLES.some((role) => role === value);
}

/** Paste a list of addresses; what is not an address is shown before anything is sent. */
export function InviteForm({ invite }: { readonly invite: InviteViewModel }): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const textId = useId();
  const roleId = useId();
  const { logins, invalid } = parseInvites(text);
  return (
    <Section label={t('members.invite.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          invite.invite(logins, role, () => {
            setText('');
          });
        }}
      >
        <label htmlFor={textId} className="o-field-label">
          {t('members.invite.logins')}
        </label>
        <textarea
          id={textId}
          className="o-input"
          rows={3}
          placeholder={t('members.invite.placeholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        {invalid.length === 0 ? null : (
          <Banner tone="warning" tag={t('members.invite.invalidTag')}>
            {t('members.invite.invalid', { list: invalid.join(', ') })}
          </Banner>
        )}
        <div className="o-inline">
          <label htmlFor={roleId} className="o-field-label">
            {t('members.invite.as')}
          </label>
          <select
            id={roleId}
            className="o-input o-select"
            value={role}
            onChange={(event) => {
              if (isInvitable(event.target.value)) setRole(event.target.value);
            }}
          >
            {/* An invitation never makes an owner: the server refuses it. */}
            {INVITABLE_ROLES.map((option) => (
              <option key={option} value={option}>
                {t(`members.role.${option}`)}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={invite.sending || logins.length === 0}>
            {invite.sending
              ? t('members.invite.sending')
              : t('members.invite.send', { count: logins.length })}
          </Button>
        </div>
      </form>
      {invite.invited === undefined ? null : (
        <Banner tone="info" tag={t('members.invite.sentTag')} live>
          {invite.invited.length === 0
            ? t('members.invite.nobody')
            : t('members.invite.sent', { list: invite.invited.join(', ') })}
        </Banner>
      )}
      {invite.failure === undefined ? null : (
        <Banner tone="danger" tag={t('members.invite.errorTag')} live>
          {invite.failure.message}
        </Banner>
      )}
    </Section>
  );
}
