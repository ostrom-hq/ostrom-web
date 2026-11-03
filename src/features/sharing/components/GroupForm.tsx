// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgMember, SharedAccount } from '@gen/api/types.gen';
import { type ReactElement, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStep } from '@/shared/lib/useStep';
import { isFound } from '@/shared/org/people';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { ShowMore } from '@/shared/ui/ShowMore';
import { GROUP_NAME_MAX, personOf, toggled } from '../groups';
import type { GroupChangeViewModel } from '../useGroups';

/** How many people the form offers at once: a large organization is searched, never listed whole. */
export const PEOPLE_STEP = 20;

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
  const searchId = useId();
  const [search, setSearch] = useState('');
  const found = useMemo(() => members.filter((member) => isFound(member, search)), [members, search]);
  const step = useStep(found.length, search, PEOPLE_STEP);
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
            {members.length > PEOPLE_STEP ? (
              <>
                <label htmlFor={searchId} className="o-field-label">
                  {t('sharing.groups.create.search')}
                </label>
                <input
                  id={searchId}
                  type="search"
                  className="o-input"
                  autoComplete="off"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                />
              </>
            ) : null}
            {found.slice(0, step.count).map((member) => (
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
            <ShowMore step={step} />
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
