// SPDX-License-Identifier: AGPL-3.0-only
import type { Budget } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { Badge } from '@/shared/ui/Badge';
import { Section } from '@/shared/ui/Screen';
import { isBudgetScope } from '../model';

export function BudgetList({ budgets }: { readonly budgets: readonly Budget[] }): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <Section label={t('spend.budgets.title')}>
      {budgets.length === 0 ? (
        <p className="o-empty">{t('spend.budgets.empty')}</p>
      ) : (
        <ul className="o-card o-rows">
          {budgets.map((budget) => {
            const who = isBudgetScope(budget.scope) ? t(`spend.budgets.scope.${budget.scope}`) : budget.scope;
            return (
              <li key={`${budget.scope}:${budget.subject ?? ''}`} className="o-row">
                <span className="o-row__main">
                  <span className="o-row__title">
                    {budget.subject === undefined ? who : `${who} · ${budget.subject}`}
                  </span>
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
    </Section>
  );
}
