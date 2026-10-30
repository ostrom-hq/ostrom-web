// SPDX-License-Identifier: AGPL-3.0-only
import type { BillingOverview } from '@gen/api/types.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { MockInstance } from 'vitest';
import { STRIPE_CHECKOUT, STRIPE_PORTAL } from '@/mocks/billing';
import { PLAN_LIMITS } from '@/mocks/fixtures/billing';
import { exit } from '@/shared/lib/leave';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';

const { server, db } = setupMockApp();

afterEach(() => {
  vi.restoreAllMocks();
});

/** The page cannot leave in a test: the way out to Stripe is watched instead. */
function leaving(): MockInstance<(url: string) => void> {
  return vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
}

function asMember(): void {
  db.members = db.members.map((member) => (member.login === 'maya' ? { ...member, role: 'member' } : member));
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

function row(rows: readonly HTMLElement[], index: number): HTMLElement {
  const found = rows[index];
  if (found === undefined) throw new Error(`no row ${String(index)}`);
  return found;
}

function billingWith(change: Partial<BillingOverview>): void {
  db.billing = { ...db.billing, ...change };
}

const FREE: Partial<BillingOverview> = {
  plan: 'free',
  effectivePlan: 'free',
  interval: null,
  status: null,
  alerts: [],
  limits: PLAN_LIMITS.free,
};

async function region(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

describe('the billing', () => {
  it('shows the plan, the period’s usage against it, and what it allows', async () => {
    visit('/billing');
    expect(await screen.findByRole('heading', { level: 1, name: 'Billing' })).toBeInTheDocument();
    const plan = await region('Plan');
    expect(within(plan).getByText('Team')).toBeInTheDocument();
    expect(within(plan).getByText(/^Billed monthly · Renews on Nov 1, 2026/)).toBeInTheDocument();
    expect(within(plan).getByText('Active')).toBeInTheDocument();
    expect(within(plan).getByText('You used 80 % of this period’s agent hours.')).toBeInTheDocument();
    const usage = await region('This period');
    expect(within(usage).getByRole('meter', { name: 'Agent hours used' })).toHaveAttribute(
      'aria-valuetext',
      '165 of 200 agent hours',
    );
    expect(within(usage).getByRole('meter')).toHaveClass('bl-meter--near');
    expect(within(usage).getByText('41')).toBeInTheDocument();
    expect(within(usage).getByText('4 of 25')).toBeInTheDocument();
    expect(within(usage).queryByText('People paid for the year')).toBeNull();
    const limits = await region('What the plan allows');
    expect(within(limits).getByText('365 days')).toBeInTheDocument();
    expect(within(limits).getByText('Not included')).toBeInTheDocument();
    expect(within(limits).getByText('Included')).toBeInTheDocument();
  });

  it('switches the plan and the interval, priced per person', async () => {
    const user = userEvent.setup();
    visit('/billing');
    const plans = await region('Plans');
    const team = within(plans).getByRole('listitem', { name: 'Team' });
    expect(within(team).getByText('$15.00 per person a month')).toBeInTheDocument();
    expect(within(team).getByRole('button', { name: 'Your plan' })).toBeDisabled();
    await user.click(within(plans).getByRole('button', { name: 'Yearly, 20 % off' }));
    const business = within(plans).getByRole('listitem', { name: 'Business' });
    expect(within(business).getByText('$336.00 per person a year')).toBeInTheDocument();
    expect(within(team).getByRole('button', { name: 'Switch to Team' })).toBeEnabled();
    await user.click(within(business).getByRole('button', { name: 'Switch to Business' }));
    expect(await within(await region('Plan')).findByText('Business')).toBeInTheDocument();
    expect(within(await region('Plan')).getByText(/^Billed yearly/)).toBeInTheDocument();
    expect(within(business).getByRole('button', { name: 'Your plan' })).toBeDisabled();
    expect(within(await region('What the plan allows')).getAllByText('Unlimited')).toHaveLength(2);
  });

  it('sends an organization without a subscription to Stripe Checkout, then waits', async () => {
    const user = userEvent.setup();
    const assign = leaving();
    billingWith(FREE);
    visit('/billing');
    const plan = await region('Plan');
    expect(within(plan).getByText('No subscription')).toBeInTheDocument();
    expect(within(plan).getByText(/^The free hours reset on/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Subscription' })).toBeNull();
    const plans = await region('Plans');
    expect(within(plans).getByRole('button', { name: 'Monthly' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(plans).getByRole('button', { name: 'Choose Team' }));
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(`${STRIPE_CHECKOUT}_team_month`);
    });
    expect(within(plans).getByRole('button', { name: 'Choose Business' })).toBeDisabled();
    // Back from Stripe out of the browser's page cache: the buttons answer again.
    window.dispatchEvent(new Event('pageshow'));
    await vi.waitFor(() => {
      expect(within(plans).getByRole('button', { name: 'Choose Business' })).toBeEnabled();
    });
  });

  it('stays when Stripe’s address is not a secure link', async () => {
    const user = userEvent.setup();
    const assign = leaving();
    billingWith(FREE);
    server.use(
      http.post('*/api/v1/orgs/:orgId/billing/checkout', () =>
        HttpResponse.json({ url: 'http://evil.test/pay' }),
      ),
    );
    visit('/billing');
    await user.click(await screen.findByRole('button', { name: 'Choose Business' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not come as a secure link');
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose Business' })).toBeEnabled();
    // The next gesture starts clean: the warning goes with it.
    server.use(
      http.post('*/api/v1/orgs/:orgId/billing/checkout', () =>
        HttpResponse.json({ url: 'https://checkout.stripe.test/pay' }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Choose Team' }));
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/pay');
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens Stripe’s portal, ends the subscription at the end of the period and takes it back', async () => {
    const user = userEvent.setup();
    const assign = leaving();
    visit('/billing');
    const subscription = await region('Subscription');
    await user.click(within(subscription).getByRole('button', { name: 'End the subscription' }));
    await user.click(within(subscription).getByRole('button', { name: /^End it on Nov 1, 2026/ }));
    expect(await within(await region('Plan')).findByText(/· Ends on Nov 1, 2026/)).toBeInTheDocument();
    await user.click(within(subscription).getByRole('button', { name: 'Keep the subscription' }));
    expect(await within(await region('Plan')).findByText(/· Renews on/)).toBeInTheDocument();
    await user.click(
      within(subscription).getByRole('button', { name: 'Payment method and billing details' }),
    );
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(STRIPE_PORTAL);
    });
  });

  it('says what the server refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/orgs/:orgId/billing/plan', () =>
        HttpResponse.json(
          { error: { type: 'payment_required', message: 'Business needs a card that passed 3-D Secure' } },
          { status: 409 },
        ),
      ),
    );
    visit('/billing');
    await user.click(await screen.findByRole('button', { name: 'Switch to Business' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Business needs a card that passed 3-D Secure',
    );
    // The next gesture starts clean: the refusal belongs to the switch only.
    leaving();
    await user.click(screen.getByRole('button', { name: 'Payment method and billing details' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('offers no plan to an Enterprise organization', async () => {
    billingWith({ plan: 'enterprise', effectivePlan: 'enterprise', limits: PLAN_LIMITS.enterprise });
    visit('/billing');
    expect(await screen.findByText(/^Your organization is on Enterprise/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Switch to|Choose) / })).toBeNull();
  });

  it('offers no plan before the first payment of the subscription', async () => {
    billingWith({ status: 'incomplete' });
    visit('/billing');
    expect(
      await screen.findByText(/^The first payment of the subscription is still due/),
    ).toBeInTheDocument();
  });

  it('says only “Yearly” when paying yearly saves nothing', async () => {
    billingWith({
      prices: [
        { plan: 'team', interval: 'month', unitAmount: 1000, currency: 'usd' },
        { plan: 'team', interval: 'year', unitAmount: 12_000, currency: 'usd' },
      ],
    });
    visit('/billing');
    const plans = await region('Plans');
    expect(within(plans).getByRole('button', { name: 'Yearly' })).toBeInTheDocument();
  });

  it('warns about a payment to make, the limits that apply meanwhile, and spent hours', async () => {
    billingWith({
      status: 'past_due',
      effectivePlan: 'free',
      alerts: [80, 100],
      usage: { agentSeconds: 720_000, agentHours: 200, sessions: 50, percentOfHours: 100 },
      paymentIssue: {
        kind: 'action_required',
        hostedInvoiceUrl: 'https://invoice.stripe.com/i/acct_test/in_9',
        at: '2026-10-29T10:00:00.000Z',
      },
    });
    visit('/billing');
    const plan = await region('Plan');
    expect(within(plan).getByText('Payment late')).toBeInTheDocument();
    expect(
      within(plan).getByText('The limits of Free apply until the payment goes through.'),
    ).toBeInTheDocument();
    expect(within(plan).getByText('Your bank asks you to confirm the payment.')).toBeInTheDocument();
    expect(within(plan).getByRole('link', { name: 'Open the invoice' })).toHaveAttribute(
      'href',
      'https://invoice.stripe.com/i/acct_test/in_9',
    );
    expect(within(plan).getByText(/^You used all of this period’s agent hours/)).toBeInTheDocument();
    expect(within(await region('This period')).getByRole('meter')).toHaveClass('bl-meter--over');
  });

  it('reads a failed payment without a page, a status it has no word for, an unlimited plan', async () => {
    billingWith({
      plan: 'enterprise',
      effectivePlan: 'enterprise',
      interval: 'year',
      status: 'paused',
      committedPeople: 30,
      limits: PLAN_LIMITS.enterprise,
      usage: { agentSeconds: 594_000, agentHours: 165, sessions: 41, percentOfHours: null },
      alerts: [],
      paymentIssue: {
        kind: 'payment_failed',
        hostedInvoiceUrl: 'javascript:alert(1)',
        at: '2026-10-29T10:00:00.000Z',
      },
    });
    visit('/billing');
    const plan = await region('Plan');
    expect(within(plan).getByText('paused')).toBeInTheDocument();
    expect(within(plan).getByText(/^The last payment failed/)).toBeInTheDocument();
    expect(within(plan).queryByRole('link')).toBeNull();
    const usage = await region('This period');
    expect(within(usage).getByText('165 agent hours, no limit')).toBeInTheDocument();
    expect(within(usage).queryByRole('meter')).toBeNull();
    expect(within(usage).getByText('4')).toBeInTheDocument();
    expect(within(usage).getByText('30')).toBeInTheDocument();
    expect(within(await region('What the plan allows')).getAllByText('Unlimited')).toHaveLength(4);
  });

  it('says when this instance sells no plan', async () => {
    billingWith({ purchasable: false });
    visit('/billing');
    expect(await screen.findByText(/^Plans are not sold on this instance/)).toBeInTheDocument();
  });

  it('keeps a plan without a price out of reach', async () => {
    billingWith({ ...FREE, prices: [] });
    visit('/billing');
    const plans = await region('Plans');
    expect(within(plans).getAllByText('No price on this instance')).toHaveLength(2);
    expect(within(plans).getByRole('button', { name: 'Choose Team' })).toBeDisabled();
  });

  it('lists the invoices with Stripe’s page and PDF, and what Stripe may add', async () => {
    db.invoices = [
      ...db.invoices,
      {
        id: 'in_x',
        number: 'ACME-0001',
        status: 'refunded',
        total: 1800,
        tax: 300,
        currency: 'usd',
        created: '2026-07-01T00:04:00.000Z',
        hostedInvoiceUrl: null,
        pdfUrl: null,
      },
    ];
    visit('/billing');
    const invoices = await region('Invoices');
    const rows = await within(invoices).findAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(row(rows, 0)).toHaveTextContent('ACME-0003');
    expect(row(rows, 0)).toHaveTextContent('$72.00, of which $12.00 tax');
    expect(within(row(rows, 0)).getByText('Paid')).toBeInTheDocument();
    expect(within(row(rows, 0)).getByRole('link', { name: 'PDF' })).toBeInTheDocument();
    expect(within(row(rows, 1)).queryByRole('link', { name: 'PDF' })).toBeNull();
    expect(within(row(rows, 2)).getByText('Invoice without a number')).toBeInTheDocument();
    expect(within(row(rows, 2)).getByText('Void')).toBeInTheDocument();
    expect(within(row(rows, 2)).queryByRole('link')).toBeNull();
    expect(within(row(rows, 3)).getByText('refunded')).toBeInTheDocument();
  });

  it('says when there is no invoice yet', async () => {
    db.invoices = [];
    visit('/billing');
    expect(await within(await region('Invoices')).findByText('No invoice yet.')).toBeInTheDocument();
  });

  it('says why the invoices did not load', async () => {
    server.use(
      http.get('*/api/v1/orgs/:orgId/billing/invoices', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'Stripe is down' } }, { status: 503 }),
      ),
    );
    visit('/billing');
    expect(await within(await region('Invoices')).findByText('Stripe is down')).toBeInTheDocument();
  });

  it('shows a member the plan without changing it', async () => {
    asMember();
    visit('/billing');
    expect(await region('Plan')).toBeInTheDocument();
    expect(screen.getByText('Owners and admins change the plan and read the invoices.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Plans' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Invoices' })).toBeNull();
  });

  it('says why the organization did not load', async () => {
    server.use(
      http.get('*/api/v1/org', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'no organization' } }, { status: 500 }),
      ),
    );
    visit('/billing');
    expect(await screen.findByText('no organization')).toBeInTheDocument();
  });

  it('says why the billing did not load', async () => {
    server.use(
      http.get('*/api/v1/orgs/:orgId/billing', () =>
        HttpResponse.json(
          { error: { type: 'not_found', message: 'organization not found' } },
          { status: 404 },
        ),
      ),
    );
    visit('/billing');
    expect(await screen.findByText('organization not found')).toBeInTheDocument();
  });
});
