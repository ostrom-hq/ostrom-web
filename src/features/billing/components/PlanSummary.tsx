// SPDX-License-Identifier: Apache-2.0
import type { BillingOverview } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { safeHref } from '@/shared/lib/safeHref';
import { formatAbsolute } from '@/shared/lib/time';
import { Badge, type BadgeTone } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Section } from '@/shared/ui/Screen';
import { hasSubscription, isKnownStatus, type KnownStatus, topAlert } from '../model';

const STATUS_TONES: Readonly<Record<KnownStatus, BadgeTone>> = {
  active: 'success',
  trialing: 'neutral',
  past_due: 'warning',
  incomplete: 'warning',
  unpaid: 'danger',
  canceled: 'neutral',
};

/** The plan, where the subscription stands, and what needs the owner now: a payment, the agent hours. */
export function PlanSummary({ billing }: { readonly billing: BillingOverview }): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const { status, paymentIssue } = billing;
  const until = formatAbsolute(billing.periodEnd, i18n.language);
  const alert = topAlert(billing.alerts);
  const invoice = safeHref(paymentIssue?.hostedInvoiceUrl ?? undefined);
  const periodKey = billing.cancelAtPeriodEnd
    ? 'billing.plan.ends'
    : hasSubscription(billing)
      ? 'billing.plan.renews'
      : 'billing.plan.resets';
  const period: string = t(periodKey, { date: until });
  return (
    <Section label={t('billing.plan.label')}>
      <div className="o-row">
        <span className="o-row__main">
          <span className="bl-plan">{enumText('billing.planName', billing.plan)}</span>
          <span className="o-row__meta">
            {billing.interval === null
              ? period
              : `${enumText('billing.plan.billed', billing.interval)} · ${period}`}
          </span>
        </span>
        {status === null ? (
          <Badge tone="neutral">{t('billing.status.none')}</Badge>
        ) : (
          <Badge tone={isKnownStatus(status) ? STATUS_TONES[status] : 'neutral'}>
            {isKnownStatus(status) ? t(`billing.status.${status}`) : status}
          </Badge>
        )}
      </div>
      {billing.effectivePlan === billing.plan ? null : (
        <Banner tone="warning" tag={t('billing.plan.limitedTag')}>
          {t('billing.plan.limited', { plan: enumText('billing.planName', billing.effectivePlan) })}
        </Banner>
      )}
      {paymentIssue === null ? null : (
        <Banner tone="danger" tag={t('billing.payment.tag')}>
          <span className="o-inline">
            <span>{enumText('billing.payment', paymentIssue.kind)}</span>
            {invoice === undefined ? null : (
              <a href={invoice} target="_blank" rel="noreferrer noopener">
                {t('billing.payment.open')}
              </a>
            )}
          </span>
        </Banner>
      )}
      {alert === undefined ? null : (
        <Banner tone={alert >= 100 ? 'danger' : 'warning'} tag={t('billing.usage.alertTag')}>
          {alert >= 100
            ? t('billing.usage.spent', { date: until })
            : t('billing.usage.near', { percent: alert })}
        </Banner>
      )}
    </Section>
  );
}
