// SPDX-License-Identifier: Apache-2.0
import type { BillingOverview } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { formatAbsolute } from '@/shared/lib/time';
import { Button } from '@/shared/ui/Button';
import { ConfirmButton } from '@/shared/ui/ConfirmButton';
import { Section } from '@/shared/ui/Screen';
import type { BillingActionsViewModel } from '../useBilling';

export interface SubscriptionProps {
  readonly billing: BillingOverview;
  readonly actions: BillingActionsViewModel;
}

/** The card and the billing details live at Stripe; ending the subscription keeps the plan until the period ends. */
export function Subscription({ billing, actions }: SubscriptionProps): ReactElement {
  const { t, i18n } = useTranslation();
  const date = formatAbsolute(billing.periodEnd, i18n.language);
  return (
    <Section label={t('billing.subscription.label')}>
      <p className="o-row__meta">{t('billing.subscription.portalHint')}</p>
      <div className="o-inline">
        <Button disabled={actions.busy} onClick={actions.openPortal}>
          {t('billing.subscription.portal')}
        </Button>
        {billing.cancelAtPeriodEnd ? (
          <Button disabled={actions.busy} onClick={actions.resume}>
            {t('billing.subscription.resume')}
          </Button>
        ) : (
          <ConfirmButton
            label={t('billing.subscription.cancel')}
            confirm={t('billing.subscription.cancelOn', { date })}
            keep={t('billing.subscription.keep')}
            disabled={actions.busy}
            onConfirm={actions.cancel}
          />
        )}
      </div>
    </Section>
  );
}
