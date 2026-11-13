// SPDX-License-Identifier: Apache-2.0
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
import { managesBilling } from '@/shared/org/roles';
import { WithOrg } from '@/shared/org/WithOrg';
import { useBilling, useBillingActions, useInvoices } from '../useBilling';
import './billing.css';

/** The organization's plan, its usage and limits, the plans on sale, the subscription and its invoices. */
export function BillingScreen(): ReactElement {
  const { t } = useTranslation();
  return (
    <WithOrg title={t('billing.title')}>
      {(org, role) => (
        <Screen title={t('billing.title')} lead={t('billing.lead')}>
          <BillingPage orgId={org.id} canManage={managesBilling(role)} />
        </Screen>
      )}
    </WithOrg>
  );
}

/** Owners, admins and the billing role buy, switch, cancel and read invoices; everyone else reads the plan. */
function BillingPage({
  orgId,
  canManage,
}: {
  readonly orgId: string;
  readonly canManage: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { billing, failure } = useBilling(orgId);
  // The invoices are fetched now, with the overview: the list shown below it reads the same query.
  useInvoices(orgId, canManage);
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
