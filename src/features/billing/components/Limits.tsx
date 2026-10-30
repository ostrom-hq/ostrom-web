// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingPlanLimits } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Facts, Section } from '@/shared/ui/Screen';

/** What the plan in force allows; going past a limit is refused by the server, which names it. */
export function Limits({ limits }: { readonly limits: BillingPlanLimits }): ReactElement {
  const { t } = useTranslation();
  const amount = (value: number | null): string | number => value ?? t('billing.limits.unlimited');
  return (
    <Section label={t('billing.limits.label')}>
      <Facts
        facts={[
          { label: t('billing.limits.people'), value: amount(limits.maxPeople) },
          { label: t('billing.limits.cloudAgents'), value: amount(limits.maxConcurrentCloudAgents) },
          { label: t('billing.limits.hours'), value: amount(limits.agentHoursPerPeriod) },
          {
            label: t('billing.limits.retention'),
            value:
              limits.receiptRetentionDays === null
                ? t('billing.limits.unlimited')
                : t('billing.limits.days', { count: limits.receiptRetentionDays }),
          },
          {
            label: t('billing.limits.sso'),
            value: limits.sso ? t('billing.limits.yes') : t('billing.limits.no'),
          },
          {
            label: t('billing.limits.policies'),
            value: limits.policies ? t('billing.limits.yes') : t('billing.limits.no'),
          },
        ]}
      />
    </Section>
  );
}
