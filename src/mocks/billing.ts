// SPDX-License-Identifier: Apache-2.0
import {
  handleCancelBillingSubscription,
  handleChangeBillingPlan,
  handleGetBilling,
  handleListBillingInvoices,
  handleOpenBillingPortal,
  handleResumeBillingSubscription,
  handleStartBillingCheckout,
} from '@gen/api/msw.gen';
import type { ApiError, BillingInvoice, BillingOverview, BillingRedirect } from '@gen/api/types.gen';
import { zBillingPlanRequest } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { PLAN_LIMITS } from '@/mocks/fixtures/billing';
import { knownValues } from '@/shared/lib/openEnum';

export interface BillingState {
  billing: BillingOverview;
  /** Newest first, as Stripe lists them. */
  invoices: BillingInvoice[];
}

/** The Stripe test pages the mock sends the browser to. */
export const STRIPE_CHECKOUT = 'https://checkout.stripe.com/c/pay/cs_test_ostrom';
export const STRIPE_PORTAL = 'https://billing.stripe.com/p/session/test_ostrom';

/** A subscription Stripe still bills: one that ended or never started leaves the organization on Free. */
const ENDED = new Set(['canceled', 'incomplete_expired']);

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

/** A plan request as the server reads it: only a plan on sale and an interval it bills (the contract's enums are open). */
function soldPlan(json: unknown) {
  const body = zBillingPlanRequest.safeParse(json);
  if (!body.success) return undefined;
  const plan = knownValues(zBillingPlanRequest.shape.plan).find((known) => known === body.data.plan);
  const interval = knownValues(zBillingPlanRequest.shape.interval).find(
    (known) => known === body.data.interval,
  );
  return plan === undefined || interval === undefined ? undefined : { plan, interval };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/**
 * Billing as the server answers it for the one organization of the mock: owners and admins buy, switch, cancel
 * and read invoices; everyone reads the plan. Stripe's pages are test URLs, never called.
 */
export function createBillingHandlers(
  state: () => BillingState,
  orgId: () => string,
  canManage: () => boolean,
): HttpHandler[] {
  const subscribed = (): boolean => {
    const { status } = state().billing;
    return status !== null && !ENDED.has(status);
  };
  /** The organization, then the right to change its billing: a stranger's organization is not found. */
  const guard = (id: string, manage: boolean): HttpResponse<ApiError> | undefined => {
    if (id !== orgId()) return refusal(404, 'not_found', 'organization not found');
    if (manage && !canManage()) return refusal(403, 'forbidden', 'only owners and admins manage billing');
    return undefined;
  };
  const save = (billing: BillingOverview): HttpResponse<BillingOverview> => {
    state().billing = billing;
    return HttpResponse.json(billing);
  };
  return [
    handleGetBilling(({ params }) => guard(params.orgId, false) ?? HttpResponse.json(state().billing)),
    handleStartBillingCheckout(async ({ params, request }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      const body = soldPlan(await readJson(request));
      if (body === undefined)
        return refusal(400, 'invalid_request', 'a plan (team, business) and an interval');
      if (!state().billing.purchasable) return refusal(409, 'not_purchasable', 'plans are not sold here');
      if (subscribed())
        return refusal(409, 'already_subscribed', 'change the plan of the subscription instead');
      const redirect: BillingRedirect = { url: `${STRIPE_CHECKOUT}_${body.plan}_${body.interval}` };
      return HttpResponse.json(redirect);
    }),
    handleOpenBillingPortal(({ params }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      if (state().billing.status === null) return refusal(409, 'no_customer', 'buy a plan first');
      const redirect: BillingRedirect = { url: STRIPE_PORTAL };
      return HttpResponse.json(redirect);
    }),
    handleChangeBillingPlan(async ({ params, request }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      const body = soldPlan(await readJson(request));
      if (body === undefined)
        return refusal(400, 'invalid_request', 'a plan (team, business) and an interval');
      if (!subscribed()) return refusal(409, 'no_subscription', 'buy a plan first');
      const { billing } = state();
      // Stripe changes no plan before the first payment of a subscription is made.
      if (billing.status === 'incomplete') return refusal(409, 'payment_due', 'pay the first invoice first');
      return save({
        ...billing,
        plan: body.plan,
        effectivePlan: body.plan,
        interval: body.interval,
        limits: PLAN_LIMITS[body.plan],
      });
    }),
    handleCancelBillingSubscription(({ params }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      if (!subscribed() || state().billing.cancelAtPeriodEnd)
        return refusal(409, 'not_cancellable', 'no subscription to end');
      return save({ ...state().billing, cancelAtPeriodEnd: true });
    }),
    handleResumeBillingSubscription(({ params }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      if (!state().billing.cancelAtPeriodEnd)
        return refusal(409, 'not_ending', 'the subscription is not ending');
      return save({ ...state().billing, cancelAtPeriodEnd: false });
    }),
    handleListBillingInvoices(({ params, request }) => {
      const refused = guard(params.orgId, true);
      if (refused !== undefined) return refused;
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? '20');
      return HttpResponse.json({ invoices: state().invoices.slice(0, limit) });
    }),
  ];
}
