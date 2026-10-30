// SPDX-License-Identifier: AGPL-3.0-only
import {
  cancelBillingSubscriptionMutation,
  changeBillingPlanMutation,
  getBillingOptions,
  getBillingQueryKey,
  listBillingInvoicesOptions,
  listBillingInvoicesQueryKey,
  openBillingPortalMutation,
  resumeBillingSubscriptionMutation,
  startBillingCheckoutMutation,
} from '@gen/api/@tanstack/react-query.gen';
import type { BillingInvoice, BillingOverview, BillingRedirect } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { failureOf } from '@/shared/api/failureOf';
import { ready } from '@/shared/api/ready';
import { leaveFor } from '@/shared/lib/leave';
import type { Interval, SoldPlan } from './model';

export interface BillingViewModel {
  readonly billing: BillingOverview | undefined;
  readonly failure: Error | undefined;
}

export function useBilling(orgId: string): BillingViewModel {
  const billing = useQuery(ready(getBillingOptions({ path: { orgId } })));
  return { billing: billing.data, failure: failureOf(billing.error) };
}

export interface InvoicesViewModel {
  readonly invoices: readonly BillingInvoice[] | undefined;
  readonly failure: Error | undefined;
}

/** The last twelve invoices: a year of a monthly plan. */
export const INVOICE_LIMIT = 12;

export function useInvoices(orgId: string): InvoicesViewModel {
  const query = useQuery(
    ready(listBillingInvoicesOptions({ path: { orgId }, query: { limit: INVOICE_LIMIT } })),
  );
  return { invoices: query.data?.invoices, failure: failureOf(query.error) };
}

export interface BillingActionsViewModel {
  /** Stripe Checkout, for an organization without a subscription. */
  readonly buy: (plan: SoldPlan, interval: Interval) => void;
  /** Another plan or interval for the running subscription; Stripe prorates it. */
  readonly change: (plan: SoldPlan, interval: Interval) => void;
  /** Stripe's portal: the card, the billing address, the tax id. */
  readonly openPortal: () => void;
  /** Ends the subscription at the end of the period, and takes that back. */
  readonly cancel: () => void;
  readonly resume: () => void;
  /** A call is on its way, or the browser is leaving for Stripe: no second click. */
  readonly busy: boolean;
  readonly failure: Error | undefined;
  /** Stripe's address was not an https page: the console stayed. */
  readonly unsafeRedirect: boolean;
}

export function useBillingActions(orgId: string): BillingActionsViewModel {
  const queryClient = useQueryClient();
  const [unsafeRedirect, setUnsafeRedirect] = useState(false);
  // The new state of the subscription is in the answer; a change or a cancellation may also issue an invoice.
  const settle = useCallback(
    async (billing: BillingOverview) => {
      queryClient.setQueryData(getBillingQueryKey({ path: { orgId } }), billing);
      await queryClient.invalidateQueries({ queryKey: listBillingInvoicesQueryKey({ path: { orgId } }) });
    },
    [queryClient, orgId],
  );
  const leave = useCallback((redirect: BillingRedirect) => {
    setUnsafeRedirect(!leaveFor(redirect.url));
  }, []);
  const checkout = useMutation({ ...startBillingCheckoutMutation(), onSuccess: leave });
  const portal = useMutation({ ...openBillingPortalMutation(), onSuccess: leave });
  const plan = useMutation({ ...changeBillingPlanMutation(), onSuccess: settle });
  const cancelling = useMutation({ ...cancelBillingSubscriptionMutation(), onSuccess: settle });
  const resuming = useMutation({ ...resumeBillingSubscriptionMutation(), onSuccess: settle });
  const all = [checkout, portal, plan, cancelling, resuming];
  const { reset: resetCheckout } = checkout;
  const { reset: resetPortal } = portal;
  // Back from Stripe with the browser's back button, the page may come out of its cache as it was left: busy.
  useEffect(() => {
    const back = (): void => {
      resetCheckout();
      resetPortal();
    };
    window.addEventListener('pageshow', back);
    return () => {
      window.removeEventListener('pageshow', back);
    };
  }, [resetCheckout, resetPortal]);
  // Each gesture starts clean: an error belongs to the last one only.
  const fresh = (): void => {
    for (const mutation of all) mutation.reset();
    setUnsafeRedirect(false);
  };
  const path = { orgId };
  const { mutate: checkoutMutate } = checkout;
  const { mutate: portalMutate } = portal;
  const { mutate: planMutate } = plan;
  const { mutate: cancelMutate } = cancelling;
  const { mutate: resumeMutate } = resuming;
  return {
    buy: (chosen, interval) => {
      fresh();
      checkoutMutate({ path, body: { plan: chosen, interval } });
    },
    change: (chosen, interval) => {
      fresh();
      planMutate({ path, body: { plan: chosen, interval } });
    },
    openPortal: () => {
      fresh();
      portalMutate({ path });
    },
    cancel: () => {
      fresh();
      cancelMutate({ path });
    },
    resume: () => {
      fresh();
      resumeMutate({ path });
    },
    busy:
      all.some((mutation) => mutation.isPending) ||
      ((checkout.isSuccess || portal.isSuccess) && !unsafeRedirect),
    failure: failureOf(all.find((mutation) => mutation.error !== null)?.error),
    unsafeRedirect,
  };
}
