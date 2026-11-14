// SPDX-License-Identifier: Apache-2.0
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import type { OrgRole } from '@/shared/org/roles';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { parseInvites } from '../model';
import type { InviteViewModel } from '../useMembers';
import { RoleSelect } from './RoleSelect';
import { FailureText } from '@/shared/ui/FailureText';

export interface InviteFormProps {
  readonly invite: InviteViewModel;
  /** The roles the viewer can give; `member` is the default. */
  readonly roles: readonly OrgRole[];
}

/** Paste a list of addresses; what is not an address is shown before anything is sent. */
export function InviteForm({ invite, roles }: InviteFormProps): ReactElement {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const textId = useId();
  const { emails, invalid } = parseInvites(text);
  return (
    <Section label={t('members.invite.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          invite.invite(emails, role, () => {
            setText('');
          });
        }}
      >
        <label htmlFor={textId} className="o-field-label">
          {t('members.invite.emails')}
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
          <RoleSelect label={t('members.invite.as')} roles={roles} value={role} onChange={setRole} />
          <Button type="submit" disabled={invite.sending || emails.length === 0}>
            {invite.sending
              ? t('members.invite.sending')
              : t('members.invite.send', { count: emails.length })}
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
          <FailureText failure={invite.failure} />
        </Banner>
      )}
    </Section>
  );
}
