// SPDX-License-Identifier: Apache-2.0
import { setDemoRole } from '@/mocks/orgs';
import {
  cancelBillingSubscription,
  changeBillingPlan,
  getBilling,
  listBillingInvoices,
  openBillingPortal,
  resumeBillingSubscription,
  startBillingCheckout,
} from '@gen/api/sdk.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { configureApiClient } from '@/shared/api/apiClient';
import { STRIPE_CHECKOUT, STRIPE_PORTAL } from '@/mocks/billing';
import { resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';

const { server, db } = createMockServer();
const path = { orgId: '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c' };
/** A well-formed organization id the viewer does not belong to. */
const OTHER_ORG = '0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
});
afterAll(() => {
  server.close();
});

async function statusOf(call: () => Promise<unknown>): Promise<number | false | undefined> {
  try {
    await call();
  } catch (error) {
    return isApiFailure(error) && error.status;
  }
  return false;
}

/** A body the generated client would never send, straight to the mock. */
async function post(route: string, body: string): Promise<number> {
  const response = await fetch(
    `http://ostrom.test/api/v1/orgs/6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c/billing/${route}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  );
  return response.status;
}

function asMember(): void {
  setDemoRole(db, 'member');
}

function withoutSubscription(): void {
  db.billing = { ...db.billing, plan: 'free', effectivePlan: 'free', interval: null, status: null };
}

describe('mock billing', () => {
  it('reads the plan of its organization only', async () => {
    expect((await getBilling({ path, throwOnError: true })).data.plan).toBe('team');
    expect(await statusOf(async () => getBilling({ path: { orgId: OTHER_ORG }, throwOnError: true }))).toBe(
      404,
    );
  });

  it('sends an organization without a subscription to Stripe Checkout, and refuses one that has it', async () => {
    const body = { plan: 'business', interval: 'year' } as const;
    expect(await statusOf(async () => startBillingCheckout({ path, body, throwOnError: true }))).toBe(409);
    withoutSubscription();
    const redirect = await startBillingCheckout({ path, body, throwOnError: true });
    expect(redirect.data.url).toBe(`${STRIPE_CHECKOUT}_business_year`);
    db.billing = { ...db.billing, status: 'canceled' };
    expect((await startBillingCheckout({ path, body, throwOnError: true })).data.url).toContain('cs_test');
  });

  it('refuses a malformed plan, an instance that sells nothing, and a member', async () => {
    withoutSubscription();
    expect(await post('checkout', JSON.stringify({ plan: 'free', interval: 'month' }))).toBe(400);
    db.billing = { ...db.billing, purchasable: false };
    const body = { plan: 'team', interval: 'month' } as const;
    expect(await statusOf(async () => startBillingCheckout({ path, body, throwOnError: true }))).toBe(409);
    asMember();
    expect(await statusOf(async () => startBillingCheckout({ path, body, throwOnError: true }))).toBe(403);
    expect(await statusOf(async () => listBillingInvoices({ path, throwOnError: true }))).toBe(403);
  });

  it('switches the plan of a subscription with the limits of the new one', async () => {
    const switched = await changeBillingPlan({
      path,
      body: { plan: 'business', interval: 'year' },
      throwOnError: true,
    });
    expect(switched.data).toMatchObject({ plan: 'business', effectivePlan: 'business', interval: 'year' });
    expect(switched.data.limits.sso).toBe(true);
    expect(await post('plan', JSON.stringify({ plan: 'team', interval: 'week' }))).toBe(400);
    db.billing = { ...db.billing, status: 'incomplete' };
    expect(
      await statusOf(async () =>
        changeBillingPlan({ path, body: { plan: 'team', interval: 'month' }, throwOnError: true }),
      ),
    ).toBe(409);
    withoutSubscription();
    expect(
      await statusOf(async () =>
        changeBillingPlan({ path, body: { plan: 'team', interval: 'month' }, throwOnError: true }),
      ),
    ).toBe(409);
    expect(
      await statusOf(async () =>
        changeBillingPlan({
          path: { orgId: OTHER_ORG },
          body: { plan: 'team', interval: 'month' },
          throwOnError: true,
        }),
      ),
    ).toBe(404);
  });

  it('ends the subscription at the end of the period, and takes that back once', async () => {
    expect(await statusOf(async () => resumeBillingSubscription({ path, throwOnError: true }))).toBe(409);
    expect((await cancelBillingSubscription({ path, throwOnError: true })).data.cancelAtPeriodEnd).toBe(true);
    expect(await statusOf(async () => cancelBillingSubscription({ path, throwOnError: true }))).toBe(409);
    expect((await resumeBillingSubscription({ path, throwOnError: true })).data.cancelAtPeriodEnd).toBe(
      false,
    );
    withoutSubscription();
    expect(await statusOf(async () => cancelBillingSubscription({ path, throwOnError: true }))).toBe(409);
    expect(
      await statusOf(async () =>
        resumeBillingSubscription({ path: { orgId: OTHER_ORG }, throwOnError: true }),
      ),
    ).toBe(404);
    expect(
      await statusOf(async () =>
        cancelBillingSubscription({ path: { orgId: OTHER_ORG }, throwOnError: true }),
      ),
    ).toBe(404);
  });

  it('opens the portal for a customer only', async () => {
    expect((await openBillingPortal({ path, throwOnError: true })).data.url).toBe(STRIPE_PORTAL);
    withoutSubscription();
    expect(await statusOf(async () => openBillingPortal({ path, throwOnError: true }))).toBe(409);
    expect(
      await statusOf(async () => openBillingPortal({ path: { orgId: OTHER_ORG }, throwOnError: true })),
    ).toBe(404);
  });

  it('lists the invoices newest first, as many as asked', async () => {
    expect((await listBillingInvoices({ path, throwOnError: true })).data.invoices).toHaveLength(3);
    const one = await listBillingInvoices({ path, query: { limit: 1 }, throwOnError: true });
    expect(one.data.invoices.map((invoice) => invoice.id)).toEqual(['in_1Q3c']);
  });

  it('reads an unreadable body as a malformed request', async () => {
    withoutSubscription();
    expect(await post('checkout', '{')).toBe(400);
  });
});
