// SPDX-License-Identifier: Apache-2.0
import type { Spending } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatUsd } from '@/shared/lib/money';
import { formatAbsolute } from '@/shared/lib/time';
import { budgetLevel } from '../model';

/** The total, then how much of the budget it is: a meter a screen reader reads as a value, amber then red. */
export function SpendTotal({ spending }: { readonly spending: Spending }): ReactElement {
  const { t, i18n } = useTranslation();
  const total = formatUsd(spending.totalUsd, i18n.language);
  const budget = spending.budgetUsd;
  return (
    <div className="o-card o-stack sp-total">
      <p className="o-row__meta">
        {t('spend.range', {
          from: formatAbsolute(spending.from, i18n.language),
          to: formatAbsolute(spending.to, i18n.language),
        })}
      </p>
      <p className="sp-figure">{total}</p>
      {budget === undefined || budget <= 0 ? (
        <p className="o-row__meta">{t('spend.noBudget')}</p>
      ) : (
        <>
          <div
            className={`sp-meter sp-meter--${budgetLevel(spending.totalUsd, budget)}`}
            role="meter"
            aria-label={t('spend.meter')}
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={Math.min(spending.totalUsd, budget)}
            aria-valuetext={t('spend.of', { spent: total, budget: formatUsd(budget, i18n.language) })}
          >
            <span
              style={{
                inlineSize: `${String(Math.min(100, Math.round((spending.totalUsd / budget) * 100)))}%`,
              }}
            />
          </div>
          <p className="o-row__meta">
            {t(`spend.level.${budgetLevel(spending.totalUsd, budget)}`, {
              percent: Math.round((spending.totalUsd / budget) * 100),
              budget: formatUsd(budget, i18n.language),
            })}
          </p>
        </>
      )}
    </div>
  );
}
