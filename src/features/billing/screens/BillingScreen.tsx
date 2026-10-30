// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/shared/ui/Banner';
import { LoadState, Screen } from '@/shared/ui/Screen';
import { Invoices } from '../components/Invoices';
import { Limits } from '../components/Limits';
import { Plans } from '../components/Plans';
import { PlanSummary } from '../components/PlanSummary';
import { Subscription } from '../components/Subscription';
import { Usage } from '../components/Usage';
import { hasSubscription } from '../model';
import { useBilling, useBillingActions, useBillingOrg } from '../useBilling';
import './billing.css';

/** The organization's plan, its usage and limits, the plans on sale, the subscription and its invoices. */
export function BillingScreen(): ReactElement {
  const { t } = useTranslation();
  const { orgId, failure } = useBillingOrg();
  return (
    <Screen title={t('billing.title')} lead={t('billing.lead')}>
      <LoadState data={orgId} failure={failure} rows={3}>
        {(id) => <BillingPage orgId={id} />}
      </LoadState>
    </Screen>
  );
}

function BillingPage({ orgId }: { readonly orgId: string }): ReactElement {
  const { t } = useTranslation();
  const { billing, failure, canManage } = useBilling(orgId);
  const actions = useBillingActions(orgId);
  return (
    <LoadState data={billing} failure={failure} rows={3}>
      {(overview) => (
        <div className="o-stack">
          {actions.failure === undefined ? null : (
            <Banner tone="danger" tag={t('billing.failureTag')} live>
              {actions.failure.message}
            </Banner>
          )}
          {actions.unsafeRedirect ? (
            <Banner tone="danger" tag={t('billing.failureTag')} live>
              {t('billing.unsafeRedirect')}
            </Banner>
          ) : null}
          <PlanSummary billing={overview} />
          <Usage billing={overview} />
          <Limits limits={overview.limits} />
          {canManage ? (
            <>
              <Plans billing={overview} actions={actions} />
              {hasSubscription(overview) ? <Subscription billing={overview} actions={actions} /> : null}
              <Invoices orgId={orgId} />
            </>
          ) : (
            <p className="o-row__meta">{t('billing.readOnly')}</p>
          )}
        </div>
      )}
    </LoadState>
  );
}
