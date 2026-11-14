// SPDX-License-Identifier: Apache-2.0
import type { BillingPlanLimits } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Facts, Section } from '@/shared/ui/Screen';

/**
 * What the plan in force allows; going past a limit is refused by the server, which names it. Cloud agents at once are
 * unlimited on every plan, which the server writes 0 (as TeamCode's concurrency settings); null is unlimited too.
 */
export function Limits({ limits }: { readonly limits: BillingPlanLimits }): ReactElement {
  const { t } = useTranslation();
  const amount = (value: number | null): string | number => value ?? t('billing.limits.unlimited');
  return (
    <Section label={t('billing.limits.label')}>
      <Facts
        facts={[
          { label: t('billing.limits.people'), value: amount(limits.maxPeople) },
          {
            label: t('billing.limits.cloudAgents'),
            value: amount(limits.maxConcurrentCloudAgents === 0 ? null : limits.maxConcurrentCloudAgents),
          },
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
