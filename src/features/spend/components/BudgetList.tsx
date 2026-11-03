// SPDX-License-Identifier: AGPL-3.0-only
import type { Budget, OrgMember } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { useStep } from '@/shared/lib/useStep';
import { Badge } from '@/shared/ui/Badge';
import { Section } from '@/shared/ui/Screen';
import { ShowMore } from '@/shared/ui/ShowMore';
import { budgetScopeOf, budgetSubjectLabel } from '../model';

/** The budgets, each member named by their login: the server names them by id. */
export function BudgetList({
  budgets,
  members,
}: {
  readonly budgets: readonly Budget[];
  readonly members: readonly OrgMember[] | undefined;
}): ReactElement {
  const { t, i18n } = useTranslation();
  // One budget a member makes hundreds of lines: a hundred at a time (PERF-CONSOLE).
  const step = useStep(budgets.length);
  return (
    <Section label={t('spend.budgets.title')}>
      {budgets.length === 0 ? (
        <p className="o-empty">{t('spend.budgets.empty')}</p>
      ) : (
        <ul className="o-card o-rows">
          {budgets.slice(0, step.count).map((budget) => {
            const scope = budgetScopeOf(budget.scope);
            const who = scope === undefined ? budget.scope : t(`spend.budgets.scope.${scope}`);
            // A member's budget reads as the person (their login), or every member's.
            const title =
              scope === 'member'
                ? (budgetSubjectLabel(budget.subject, members) ?? t('spend.budgets.everyMember'))
                : budget.subject === undefined
                  ? who
                  : `${who} · ${budget.subject}`;
            return (
              <li key={`${scope ?? budget.scope}:${budget.subject ?? ''}`} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title">{title}</span>
                  <span className="o-row__meta">
                    {[
                      budget.usdPerMonth === undefined
                        ? undefined
                        : t('spend.budgets.monthly', { usd: formatUsd(budget.usdPerMonth, i18n.language) }),
                      budget.usdPerDay === undefined
                        ? undefined
                        : t('spend.budgets.daily', { usd: formatUsd(budget.usdPerDay, i18n.language) }),
                    ]
                      .filter((part) => part !== undefined)
                      .join(' · ')}
                  </span>
                </span>
                <Badge tone={budget.hardStop ? 'danger' : 'warning'}>
                  {budget.hardStop ? t('spend.budgets.stops') : t('spend.budgets.warns')}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
      <ShowMore step={step} />
    </Section>
  );
}
