// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgMember, SharedAccount } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { GROUP_NAME_MAX, personOf, toggled } from '../groups';
import type { GroupChangeViewModel } from '../useGroups';

export interface GroupFormProps {
  readonly change: GroupChangeViewModel;
  readonly members: readonly OrgMember[];
  readonly accounts: readonly SharedAccount[];
}

/** A new group: a name, the people in it and the subscriptions it lends. The server says what it refuses. */
export function GroupForm({ change, members, accounts }: GroupFormProps): ReactElement {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [lent, setLent] = useState<readonly string[]>([]);
  const nameId = useId();
  const trimmed = name.trim();
  return (
    <Section label={t('sharing.groups.create.title')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          change.create({ name: trimmed, members: [...chosen], accounts: [...lent] }, () => {
            setName('');
            setChosen([]);
            setLent([]);
          });
        }}
      >
        <label htmlFor={nameId} className="o-field-label">
          {t('sharing.groups.create.name')}
        </label>
        <input
          id={nameId}
          className="o-input"
          autoComplete="off"
          maxLength={GROUP_NAME_MAX}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {members.length === 0 ? null : (
          <fieldset className="o-stack sh-people">
            <legend className="o-field-label">{t('sharing.groups.create.members')}</legend>
            {members.map((member) => (
              <label key={member.login} className="o-inline">
                <input
                  type="checkbox"
                  checked={chosen.includes(member.login)}
                  onChange={(event) => {
                    setChosen(toggled(chosen, member.login, event.target.checked));
                  }}
                />
                <span>{personOf(member)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {accounts.length === 0 ? null : (
          <fieldset className="o-stack sh-people">
            <legend className="o-field-label">{t('sharing.groups.create.accounts')}</legend>
            {accounts.map((account) => (
              <label key={account.id} className="o-inline">
                <input
                  type="checkbox"
                  checked={lent.includes(account.id)}
                  onChange={(event) => {
                    setLent(toggled(lent, account.id, event.target.checked));
                  }}
                />
                <span>{account.label}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="o-inline">
          <Button type="submit" disabled={change.pending || trimmed === ''}>
            {change.pending ? t('sharing.groups.create.saving') : t('sharing.groups.create.submit')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
