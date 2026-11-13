// SPDX-License-Identifier: Apache-2.0
import type { BillingInvoice, BillingOverview, BillingPlanLimits } from '@gen/api/types.gen';
import type { Known } from '@/shared/lib/openEnum';

/** What each plan allows, as the server's catalog says; null is unlimited. */
export const PLAN_LIMITS: Readonly<Record<Known<BillingOverview['plan']>, BillingPlanLimits>> = {
  free: {
    maxPeople: 3,
    maxConcurrentCloudAgents: 1,
    agentHoursPerPeriod: 10,
    sso: false,
    policies: false,
    receiptRetentionDays: 30,
  },
  team: {
    maxPeople: 25,
    maxConcurrentCloudAgents: 3,
    agentHoursPerPeriod: 200,
    sso: false,
    policies: true,
    receiptRetentionDays: 365,
  },
  business: {
    maxPeople: null,
    maxConcurrentCloudAgents: 10,
    agentHoursPerPeriod: 1000,
    sso: true,
    policies: true,
    receiptRetentionDays: null,
  },
  enterprise: {
    maxPeople: null,
    maxConcurrentCloudAgents: null,
    agentHoursPerPeriod: null,
    sso: true,
    policies: true,
    receiptRetentionDays: null,
  },
};

const overview: BillingOverview = {
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
  limits: PLAN_LIMITS.team,
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

const invoices: BillingInvoice[] = [
  {
    id: 'in_1Q3c',
    number: 'ACME-0003',
    status: 'paid',
    total: 7200,
    tax: 1200,
    currency: 'usd',
    created: '2026-10-01T00:04:00.000Z',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_test/in_1Q3c',
    pdfUrl: 'https://pay.stripe.com/invoice/acct_test/in_1Q3c/pdf',
  },
  {
    id: 'in_1Q2b',
    number: 'ACME-0002',
    status: 'paid',
    total: 5400,
    tax: 900,
    currency: 'usd',
    created: '2026-09-01T00:04:00.000Z',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_test/in_1Q2b',
    pdfUrl: null,
  },
  {
    id: 'in_1Q1a',
    number: null,
    status: 'void',
    total: 1800,
    tax: 300,
    currency: 'usd',
    created: '2026-08-14T10:21:00.000Z',
    hostedInvoiceUrl: null,
    pdfUrl: null,
  },
];

export function initialBilling(): BillingOverview {
  return structuredClone(overview);
}

export function initialInvoices(): BillingInvoice[] {
  return structuredClone(invoices);
}
