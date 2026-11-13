// SPDX-License-Identifier: Apache-2.0
import type { BillingOverview, BillingPrice } from '@gen/api/types.gen';
import {
  hasSubscription,
  hoursLevel,
  isInterval,
  isInvoiceStatus,
  isKnownStatus,
  offerFor,
  plansState,
  priceOf,
  topAlert,
  yearlySaving,
} from './model';

// Built here: features/ never imports the mocks, not even in a test.
const team: BillingOverview = {
  orgId: '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c',
  plan: 'team',
  effectivePlan: 'team',
  interval: 'month',
  status: 'active',
  cancelAtPeriodEnd: false,
  periodStart: '2026-10-01T00:00:00.000Z',
  periodEnd: '2026-11-01T00:00:00.000Z',
  activePeople: 4,
  committedPeople: 0,
  limits: {
    maxPeople: 25,
    maxConcurrentCloudAgents: 3,
    agentHoursPerPeriod: 200,
    sso: false,
    policies: true,
    receiptRetentionDays: 365,
  },
  usage: { agentSeconds: 594_000, agentHours: 165, sessions: 41, percentOfHours: 82 },
  alerts: [80],
  paymentIssue: null,
  purchasable: true,
  prices: [
    { plan: 'team', interval: 'month', unitAmount: 1500, currency: 'usd' },
    { plan: 'team', interval: 'year', unitAmount: 14_400, currency: 'usd' },
    { plan: 'business', interval: 'month', unitAmount: 3500, currency: 'usd' },
    { plan: 'business', interval: 'year', unitAmount: 33_600, currency: 'usd' },
  ],
};

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

describe('plansState', () => {
  it('opens the plans, except to Enterprise and before the first payment', () => {
    expect(plansState(team)).toBe('open');
    expect(plansState({ ...team, plan: 'enterprise' })).toBe('enterprise');
    expect(plansState({ ...team, status: 'incomplete' })).toBe('unpaid');
  });
});

describe('yearlySaving', () => {
  const price = (
    plan: BillingPrice['plan'],
    interval: BillingPrice['interval'],
    unitAmount: number,
  ): BillingPrice => ({
    plan,
    interval,
    unitAmount,
    currency: 'usd',
  });

  it('is the least saving of paying yearly across the plans, in whole percent', () => {
    expect(yearlySaving(team.prices)).toBe(20);
    expect(yearlySaving([price('team', 'month', 1000), price('team', 'year', 11_000)])).toBe(8);
    expect(
      yearlySaving([
        price('team', 'month', 1000),
        price('team', 'year', 10_800),
        price('business', 'month', 1000),
        price('business', 'year', 9600),
      ]),
    ).toBe(10);
  });

  it('is nothing without both prices, a free month, or no saving', () => {
    expect(yearlySaving([])).toBeUndefined();
    expect(yearlySaving([price('team', 'month', 1000)])).toBeUndefined();
    expect(yearlySaving([price('team', 'month', 0), price('team', 'year', 0)])).toBeUndefined();
    expect(yearlySaving([price('team', 'month', 1000), price('team', 'year', 12_000)])).toBeUndefined();
  });
});
