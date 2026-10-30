// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingOverview, BillingPrice } from '@gen/api/types.gen';

/** The plans the console sells; Free has nothing to buy and Enterprise is sold by talking to us. */
export const PLANS = ['team', 'business'] as const satisfies readonly BillingPrice['plan'][];
export type SoldPlan = (typeof PLANS)[number];
export const INTERVALS = ['month', 'year'] as const satisfies readonly BillingPrice['interval'][];
export type Interval = (typeof INTERVALS)[number];

export function isInterval(value: string): value is Interval {
  return INTERVALS.some((interval) => interval === value);
}

/** Stripe's statuses the console has words for; any other is shown as Stripe writes it. */
export const STATUSES = ['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'canceled'] as const;
export type KnownStatus = (typeof STATUSES)[number];

export function isKnownStatus(status: string): status is KnownStatus {
  return STATUSES.some((known) => known === status);
}

/** A subscription Stripe still bills; one that ended or never started leaves the organization on Free. */
export function hasSubscription(billing: BillingOverview): boolean {
  return billing.status !== null && billing.status !== 'canceled' && billing.status !== 'incomplete_expired';
}

export function priceOf(
  prices: readonly BillingPrice[],
  plan: SoldPlan,
  interval: Interval,
): BillingPrice | undefined {
  return prices.find((price) => price.plan === plan && price.interval === interval);
}

/**
 * What a plan card offers: the plan in force, a switch of the running subscription (Stripe prorates it), or a
 * purchase through Stripe Checkout when there is no subscription.
 */
export type PlanOffer = 'current' | 'switch' | 'buy';

/**
 * Whether the plan cards offer anything: not to an Enterprise organization (its contract is signed with us), and
 * not while the first payment of a subscription is still due (Stripe's `incomplete`: pay it first).
 */
export type PlansState = 'open' | 'enterprise' | 'unpaid';

export function plansState(billing: BillingOverview): PlansState {
  if (billing.plan === 'enterprise') return 'enterprise';
  return billing.status === 'incomplete' ? 'unpaid' : 'open';
}

/**
 * What paying yearly saves on every plan at least, in whole percent, or undefined when it saves nothing: one label
 * stands for all the plan cards, so it never promises more than the least of them.
 */
export function yearlySaving(prices: readonly BillingPrice[]): number | undefined {
  const savings = PLANS.flatMap((plan) => {
    const month = priceOf(prices, plan, 'month');
    const year = priceOf(prices, plan, 'year');
    if (month === undefined || year === undefined || month.unitAmount <= 0) return [];
    return [Math.round((1 - year.unitAmount / (12 * month.unitAmount)) * 100)];
  });
  const least = Math.min(...savings);
  return savings.length > 0 && least > 0 ? least : undefined;
}

export function offerFor(billing: BillingOverview, plan: SoldPlan, interval: Interval): PlanOffer {
  if (!hasSubscription(billing)) return 'buy';
  return billing.plan === plan && billing.interval === interval ? 'current' : 'switch';
}

/** How full the agent hours are: calm, near the limit (80 %, the server's first alert), or at it. */
export type HoursLevel = 'ok' | 'near' | 'over';

export function hoursLevel(percent: number): HoursLevel {
  if (percent >= 100) return 'over';
  return percent >= 80 ? 'near' : 'ok';
}

/** The highest usage alert of the period, the one worth saying. */
export function topAlert(alerts: readonly number[]): number | undefined {
  return alerts.length === 0 ? undefined : Math.max(...alerts);
}

/** Stripe's invoice statuses and how they read. */
export const INVOICE_TONES = {
  paid: 'success',
  open: 'warning',
  uncollectible: 'danger',
  void: 'neutral',
  draft: 'neutral',
} as const;
export type InvoiceStatus = keyof typeof INVOICE_TONES;

export function isInvoiceStatus(status: string): status is InvoiceStatus {
  return Object.hasOwn(INVOICE_TONES, status);
}
