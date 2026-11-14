// SPDX-License-Identifier: Apache-2.0
import type { Group, SharedAccount } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { lentAccounts, toggled } from '../groups';
import type { GroupChangeViewModel } from '../useGroups';

export interface GroupLendingProps {
  readonly group: Group;
  /** The subscriptions the person reads; nothing is said until they are known. */
  readonly accounts: readonly SharedAccount[] | undefined;
  /** Present for an owner or an admin. */
  readonly change: GroupChangeViewModel | undefined;
}

/** The subscriptions the group lends; an owner or an admin ticks them and saves the whole list. */
export function GroupLending({ group, accounts, change }: GroupLendingProps): ReactElement {
  const { t } = useTranslation();
  return (
    <Section label={t('sharing.groups.lending')}>
      {accounts === undefined ? null : change === undefined || accounts.length === 0 ? (
        <LentList group={group} accounts={accounts} />
      ) : (
        <LendForm key={group.accounts.join(',')} group={group} accounts={accounts} change={change} />
      )}
    </Section>
  );
}

interface LentListProps {
  readonly group: Group;
  readonly accounts: readonly SharedAccount[];
}

function LentList({ group, accounts }: LentListProps): ReactElement {
  const { t } = useTranslation();
  const lent = lentAccounts(group.accounts, accounts);
  const hidden = group.accounts.length - lent.length;
  return lent.length === 0 ? (
    <p className="o-row__meta">
      {hidden === 0 ? t('sharing.groups.lendingNone') : t('sharing.groups.lendingHidden', { count: hidden })}
    </p>
  ) : (
    <ul className="o-rows">
      {lent.map((account) => (
        <li key={account.id} className="o-row">
          <span className="o-row__title">{account.label}</span>
        </li>
      ))}
    </ul>
  );
}

interface LendFormProps {
  readonly group: Group;
  readonly accounts: readonly SharedAccount[];
  readonly change: GroupChangeViewModel;
}

/** The ids of a subscription the person cannot read stay in the list sent: ticking never drops them. */
function LendForm({ group, accounts, change }: LendFormProps): ReactElement {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<readonly string[]>(group.accounts);
  const same = chosen.length === group.accounts.length && chosen.every((id) => group.accounts.includes(id));
  return (
    <form
      className="o-stack"
      onSubmit={(event) => {
        event.preventDefault();
        change.lend(group.id, chosen, () => undefined);
      }}
    >
      <fieldset className="o-stack sh-people">
        <legend className="o-field-label">{t('sharing.groups.lendingPick')}</legend>
        {accounts.map((account) => (
          <label key={account.id} className="o-inline">
            <input
              type="checkbox"
              checked={chosen.includes(account.id)}
              onChange={(event) => {
                setChosen(toggled(chosen, account.id, event.target.checked));
              }}
            />
            <span>{account.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="o-inline">
        <Button type="submit" disabled={change.pending || same}>
          {t('sharing.groups.lendingSave')}
        </Button>
      </div>
    </form>
  );
}
