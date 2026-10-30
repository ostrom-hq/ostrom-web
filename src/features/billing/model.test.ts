// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingOverview } from '@gen/api/types.gen';
import { initialBilling } from '@/mocks/fixtures/billing';
import {
  hasSubscription,
  hoursLevel,
  isInterval,
  isInvoiceStatus,
  isKnownStatus,
  offerFor,
  priceOf,
  topAlert,
} from './model';

const team: BillingOverview = initialBilling();

describe('the billing model', () => {
  it('knows a subscription Stripe still bills', () => {
    expect(hasSubscription(team)).toBe(true);
    expect(hasSubscription({ ...team, status: 'past_due' })).toBe(true);
    expect(hasSubscription({ ...team, status: null })).toBe(false);
    expect(hasSubscription({ ...team, status: 'canceled' })).toBe(false);
    expect(hasSubscription({ ...team, status: 'incomplete_expired' })).toBe(false);
  });

  it('offers the plan in force, a switch, or a purchase', () => {
    expect(offerFor(team, 'team', 'month')).toBe('current');
    expect(offerFor(team, 'team', 'year')).toBe('switch');
    expect(offerFor(team, 'business', 'month')).toBe('switch');
    expect(offerFor({ ...team, status: null, plan: 'free', interval: null }, 'team', 'month')).toBe('buy');
  });

  it('finds the price of a plan and an interval', () => {
    expect(priceOf(team.prices, 'business', 'year')?.unitAmount).toBe(33_600);
    expect(priceOf([], 'team', 'month')).toBeUndefined();
  });

  it('grades the agent hours and keeps the highest alert', () => {
    expect([hoursLevel(10), hoursLevel(80), hoursLevel(99), hoursLevel(100), hoursLevel(130)]).toEqual([
      'ok',
      'near',
      'near',
      'over',
      'over',
    ]);
    expect([topAlert([]), topAlert([80]), topAlert([80, 100])]).toEqual([undefined, 80, 100]);
  });

  it('tells the words it has from what Stripe may add', () => {
    expect([isInterval('year'), isInterval('week')]).toEqual([true, false]);
    expect([isKnownStatus('past_due'), isKnownStatus('paused')]).toEqual([true, false]);
    expect([isInvoiceStatus('paid'), isInvoiceStatus('refunded'), isInvoiceStatus('toString')]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
