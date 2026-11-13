// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingOverview } from '@gen/api/types.gen';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinor } from '@/shared/lib/money';
import { Button } from '@/shared/ui/Button';
import { Section } from '@/shared/ui/Screen';
import {
  type Interval,
  INTERVALS,
  isInterval,
  offerFor,
  PLANS,
  plansState,
  priceOf,
  yearlySaving,
} from '../model';
import type { BillingActionsViewModel } from '../useBilling';

export interface PlansProps {
  readonly billing: BillingOverview;
  readonly actions: BillingActionsViewModel;
}

/**
 * The plans on sale, priced per person: buying one goes to Stripe Checkout, switching changes the running
 * subscription (Stripe prorates it). A self-hosted instance sells nothing.
 */
export function Plans({ billing, actions }: PlansProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [interval, setInterval] = useState<Interval>(
    typeof billing.interval === 'string' && isInterval(billing.interval) ? billing.interval : 'month',
  );
  const state = plansState(billing);
  if (!billing.purchasable)
    return (
      <Section label={t('billing.plans.label')}>
        <p className="o-row__meta">{t('billing.plans.notSold')}</p>
      </Section>
    );
  if (state !== 'open')
    return (
      <Section label={t('billing.plans.label')}>
        <p className="o-row__meta">{t(`billing.plans.closed.${state}`)}</p>
      </Section>
    );
  const saving = yearlySaving(billing.prices);
  return (
    <Section label={t('billing.plans.label')}>
      <div className="o-inline" role="group" aria-label={t('billing.plans.interval')}>
        {INTERVALS.map((option) => (
          <Button
            key={option}
            variant="ghost"
            aria-pressed={interval === option}
            onClick={() => {
              setInterval(option);
            }}
          >
            {option === 'year' && saving !== undefined
              ? t('billing.plans.yearSaving', { percent: saving })
              : t(`billing.plans.every.${option}`)}
          </Button>
        ))}
      </div>
      <ul className="bl-plans">
        {PLANS.map((plan) => {
          const price = priceOf(billing.prices, plan, interval);
          const offer = offerFor(billing, plan, interval);
          const name = t(`billing.planName.${plan}`);
          return (
            <li key={plan} className="o-card o-stack bl-offer" aria-label={name}>
              <span className="o-row__title">{name}</span>
              <span className="bl-price">
                {price === undefined
                  ? t('billing.plans.noPrice')
                  : t(`billing.plans.per.${interval}`, {
                      price: formatMinor(price.unitAmount, price.currency, i18n.language),
                    })}
              </span>
              <span className="o-row__meta">{t(`billing.plans.pitch.${plan}`)}</span>
              {offer === 'current' ? (
                <Button disabled>{t('billing.plans.current')}</Button>
              ) : (
                <Button
                  disabled={actions.busy || price === undefined}
                  onClick={() => {
                    (offer === 'buy' ? actions.buy : actions.change)(plan, interval);
                  }}
                >
                  {t(`billing.plans.${offer}`, { plan: name })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
