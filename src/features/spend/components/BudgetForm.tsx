// SPDX-License-Identifier: AGPL-3.0-only
import type { OrgMember } from '@gen/api/types.gen';
import { type ReactElement, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import { BUDGET_SCOPES, type BudgetScope, draftBudget, isBudgetScope } from '../model';
import type { BudgetChangeViewModel } from '../useSpend';

/**
 * Setting a budget for a scope and subject replaces the one already there. A member is chosen by login, from the
 * organization's members, and sent by id: the server knows members by id.
 */
export function BudgetForm({
  change,
  members,
}: {
  readonly change: BudgetChangeViewModel;
  readonly members: readonly OrgMember[] | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const [scope, setScope] = useState<BudgetScope>('org');
  const [subject, setSubject] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [hardStop, setHardStop] = useState(false);
  const ids = { scope: useId(), subject: useId(), month: useId(), day: useId(), stop: useId() };
  const budget = draftBudget({ scope, subject, month, day, hardStop });
  return (
    <Section label={t('spend.budgets.set')}>
      <form
        className="o-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (budget !== undefined)
            change.save(budget, () => {
              setSubject('');
              setMonth('');
              setDay('');
              setHardStop(false);
            });
        }}
      >
        <div className="o-inline">
          <label htmlFor={ids.scope} className="o-field-label">
            {t('spend.budgets.for')}
          </label>
          <select
            id={ids.scope}
            className="o-input o-select"
            value={scope}
            onChange={(event) => {
              if (isBudgetScope(event.target.value)) setScope(event.target.value);
            }}
          >
            {BUDGET_SCOPES.map((option) => (
              <option key={option} value={option}>
                {t(`spend.budgets.scope.${option}`)}
              </option>
            ))}
          </select>
          {scope === 'org' ? null : (
            <>
              <label htmlFor={ids.subject} className="o-visually-hidden">
                {t('spend.budgets.person')}
              </label>
              <select
                id={ids.subject}
                className="o-input o-select"
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                }}
              >
                <option value="">{t('spend.budgets.everyMember')}</option>
                {(members ?? []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.login}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="o-inline">
          <label htmlFor={ids.month} className="o-field-label">
            {t('spend.budgets.perMonth')}
          </label>
          <input
            id={ids.month}
            className="o-input sp-amount"
            inputMode="decimal"
            autoComplete="off"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
            }}
          />
          <label htmlFor={ids.day} className="o-field-label">
            {t('spend.budgets.perDay')}
          </label>
          <input
            id={ids.day}
            className="o-input sp-amount"
            inputMode="decimal"
            autoComplete="off"
            value={day}
            onChange={(event) => {
              setDay(event.target.value);
            }}
          />
        </div>
        <div className="o-inline">
          <input
            id={ids.stop}
            type="checkbox"
            checked={hardStop}
            onChange={(event) => {
              setHardStop(event.target.checked);
            }}
          />
          <label htmlFor={ids.stop}>{t('spend.budgets.hardStop')}</label>
        </div>
        <div className="o-inline">
          <Button type="submit" disabled={change.saving || budget === undefined}>
            {change.saving ? t('spend.budgets.saving') : t('spend.budgets.save')}
          </Button>
        </div>
      </form>
    </Section>
  );
}
