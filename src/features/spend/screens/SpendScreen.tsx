// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { Breakdown } from '../components/Breakdown';
import { BudgetForm } from '../components/BudgetForm';
import { BudgetList } from '../components/BudgetList';
import { DailySpend } from '../components/DailySpend';
import { SpendTotal } from '../components/SpendTotal';
import { type Period, PERIODS } from '../model';
import { useBudgetChange, useSpend } from '../useSpend';
import './spend.css';

/** What the agents cost, by agent, repository and person, against the budgets that warn or stop them. */
export function SpendScreen(): ReactElement {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('month');
  const view = useSpend(period);
  const change = useBudgetChange();
  return (
    <Screen title={t('spend.title')} lead={t('spend.lead')}>
      <div className="o-inline" role="group" aria-label={t('spend.period.label')}>
        {PERIODS.map((option) => (
          <Button
            key={option}
            variant="ghost"
            aria-pressed={period === option}
            onClick={() => {
              setPeriod(option);
            }}
          >
            {t(`spend.period.${option}`)}
          </Button>
        ))}
      </div>
      <LoadState data={view.spending} failure={view.failure} rows={2}>
        {(spending) => (
          <div className="o-stack" aria-busy={view.switching}>
            <SpendTotal spending={spending} />
            <DailySpend days={spending.daily} />
            <Breakdown label={t('spend.byPerson')} lines={spending.byPerson} />
            <Breakdown label={t('spend.byAgent')} lines={spending.byAgent} />
            <Breakdown label={t('spend.byRepo')} lines={spending.byRepo} />
          </div>
        )}
      </LoadState>
      {view.budgets === undefined ? null : <BudgetList budgets={view.budgets} />}
      {change.failure === undefined ? null : (
        <Banner tone="danger" tag={t('spend.budgets.errorTag')} live>
          {change.failure.message}
        </Banner>
      )}
      {view.canManage ? <BudgetForm change={change} /> : null}
    </Screen>
  );
}
