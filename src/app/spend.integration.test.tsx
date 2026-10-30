// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { spendingFor } from '@/mocks/fixtures/spend';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function asMember(): void {
  db.members = db.members.map((member) => (member.login === 'maya' ? { ...member, role: 'member' } : member));
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

function spendWith(total: number, budget: number | undefined): void {
  server.use(
    http.get('*/api/v1/spending', () =>
      HttpResponse.json({
        ...spendingFor('week'),
        totalUsd: total,
        ...(budget === undefined ? {} : { budgetUsd: budget }),
      }),
    ),
  );
}

function rows(region: string): HTMLElement[] {
  return within(screen.getByRole('region', { name: region })).getAllByRole('listitem');
}

describe('the spend', () => {
  it('shows the month against the budget, by day, person, agent and repository', async () => {
    visit('/spend');
    expect(await screen.findByRole('heading', { level: 1, name: 'Spend' })).toBeInTheDocument();
    expect(await screen.findByText('$1,119.30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true');
    const meter = screen.getByRole('meter', { name: 'Spent of the budget' });
    expect(meter).toHaveAttribute('aria-valuetext', '$1,119.30 of $1,200.00');
    expect(meter).toHaveAttribute('aria-valuenow', '1119.3');
    expect(screen.getByText('93 % of the $1,200.00 budget: close to the limit')).toBeInTheDocument();
    const days = rows('By day');
    expect(days).toHaveLength(7);
    expect(days[6]).toHaveAccessibleName('Fri, Oct 30 · $47.05');
    const people = rows('By person');
    expect(people[0]).toHaveTextContent('Theo Martin');
    expect(people[0]).toHaveTextContent('101 sessions');
    expect(people[0]).toHaveTextContent('$554.82');
    expect(rows('By agent')).toHaveLength(2);
    expect(rows('By repository')).toHaveLength(3);
  });

  it('switches to the last seven days, without a budget', async () => {
    const user = userEvent.setup();
    visit('/spend');
    await screen.findByText('$1,119.30');
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(await screen.findByText('$265.65')).toBeInTheDocument();
    expect(screen.getByText(/No budget for the organization/)).toBeInTheDocument();
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it('keeps the month on screen while the week loads', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/spending', async ({ request }) =>
        new URL(request.url).searchParams.get('period') === 'week'
          ? never()
          : HttpResponse.json(spendingFor('month')),
      ),
    );
    visit('/spend');
    await screen.findByText('$1,119.30');
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(screen.getByText('$1,119.30').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('is calm under 80 % and says when the budget is spent', async () => {
    spendWith(100, 1_000);
    visit('/spend');
    expect(await screen.findByText('10 % of the $1,000.00 budget')).toBeInTheDocument();
  });

  it('caps the meter at the budget once it is spent', async () => {
    spendWith(1_500, 1_000);
    visit('/spend');
    expect(await screen.findByText('150 % of the $1,000.00 budget: over the limit')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '1000');
  });

  it('treats a zero budget as no budget', async () => {
    spendWith(10, 0);
    visit('/spend');
    expect(await screen.findByText(/No budget for the organization/)).toBeInTheDocument();
  });

  it('says when nothing was spent, and shows no day without days', async () => {
    server.use(
      http.get('*/api/v1/spending', () =>
        HttpResponse.json({
          ...spendingFor('week'),
          totalUsd: 0,
          byAgent: [],
          byRepo: [],
          byPerson: [{ key: 'x', label: 'x', usd: 0, sessions: 0 }],
          daily: [],
        }),
      ),
    );
    visit('/spend');
    expect(await screen.findAllByText('Nothing spent in this period.', {}, { timeout: 4_000 })).toHaveLength(
      2,
    );
    expect(screen.queryByRole('region', { name: 'By day' })).toBeNull();
  });

  it('draws a day of nothing flat, and shows a date it cannot read as is', async () => {
    server.use(
      http.get('*/api/v1/spending', () =>
        HttpResponse.json({
          ...spendingFor('week'),
          daily: [
            { date: 'someday', usd: 0 },
            { date: '2026-10-30', usd: 0 },
          ],
        }),
      ),
    );
    visit('/spend');
    expect(await screen.findByRole('listitem', { name: 'someday · $0.00' })).toBeInTheDocument();
  });

  it('shows the shape of the page while it loads, and why it does not come', async () => {
    server.use(http.get('*/api/v1/spending', never));
    visit('/spend');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says why the spend does not come', async () => {
    server.use(http.get('*/api/v1/spending', () => HttpResponse.error()));
    visit('/spend');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('the budgets', () => {
  it('lists the organization first, with what each one does at the limit', async () => {
    visit('/spend');
    const budgets = await within(await screen.findByRole('region', { name: 'Budgets' })).findAllByRole(
      'listitem',
    );
    expect(budgets[0]).toHaveTextContent('The organization');
    expect(budgets[0]).toHaveTextContent('$1,200.00 a month');
    expect(budgets[0]).toHaveTextContent('Warns');
    expect(budgets[1]).toHaveTextContent('A member · theo');
    expect(budgets[1]).toHaveTextContent('$25.00 a day');
    expect(budgets[1]).toHaveTextContent('Stops');
  });

  it('shows a scope it has no word for as is, both amounts, and says when there is none', async () => {
    db.budgets = [{ scope: 'team', subject: 'billing', usdPerMonth: 10, usdPerDay: 1, hardStop: false }];
    visit('/spend');
    expect(await screen.findByText('team · billing')).toBeInTheDocument();
    expect(screen.getByText('$10.00 a month · $1.00 a day')).toBeInTheDocument();
  });

  it('says when there is no budget', async () => {
    db.budgets = [];
    visit('/spend');
    expect(await screen.findByText('No budget yet.')).toBeInTheDocument();
  });

  it('sets a member budget that stops the agents, only once it is complete', async () => {
    const user = userEvent.setup();
    visit('/spend');
    const form = await screen.findByRole('region', { name: 'Set a budget' });
    const save = within(form).getByRole('button', { name: 'Save the budget' });
    expect(save).toBeDisabled();
    const budgets = db.budgets.length;
    const element = save.closest('form');
    if (element !== null) fireEvent.submit(element);
    expect(db.budgets).toHaveLength(budgets);
    const scope = within(form).getByRole('combobox', { name: 'For' });
    await user.selectOptions(scope, 'member');
    fireEvent.change(scope, { target: { value: 'team' } });
    await user.type(within(form).getByRole('textbox', { name: 'Per day ($)' }), '12,50');
    expect(save).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Login' }), 'ana');
    await user.type(within(form).getByRole('textbox', { name: 'Per month ($)' }), 'ten');
    expect(save).toBeDisabled();
    await user.clear(within(form).getByRole('textbox', { name: 'Per month ($)' }));
    await user.click(within(form).getByRole('checkbox', { name: /Stop the agents/ }));
    await user.click(save);
    expect(await screen.findByText('A member · ana')).toBeInTheDocument();
    expect(db.budgets).toContainEqual({ scope: 'member', subject: 'ana', usdPerDay: 12.5, hardStop: true });
    expect(within(form).getByRole('textbox', { name: 'Login' })).toHaveValue('');
    expect(within(form).getByRole('checkbox', { name: /Stop the agents/ })).not.toBeChecked();
  });

  it('replaces the organization budget, and refuses a bad daily amount', async () => {
    const user = userEvent.setup();
    visit('/spend');
    const form = await screen.findByRole('region', { name: 'Set a budget' });
    await user.type(within(form).getByRole('textbox', { name: 'Per day ($)' }), '0');
    await user.type(within(form).getByRole('textbox', { name: 'Per month ($)' }), '1500');
    expect(within(form).getByRole('button', { name: 'Save the budget' })).toBeDisabled();
    await user.clear(within(form).getByRole('textbox', { name: 'Per day ($)' }));
    await user.selectOptions(within(form).getByRole('combobox', { name: 'For' }), 'workflow');
    expect(within(form).getByRole('textbox', { name: 'Workflow ID' })).toBeInTheDocument();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'For' }), 'org');
    await user.click(within(form).getByRole('button', { name: 'Save the budget' }));
    expect(await screen.findByText('$1,500.00 a month')).toBeInTheDocument();
  });

  it('holds the form while it saves, and says why the server refused', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/budgets', async () => delay('infinite')));
    visit('/spend');
    const form = await screen.findByRole('region', { name: 'Set a budget' });
    await user.type(within(form).getByRole('textbox', { name: 'Per month ($)' }), '5');
    await user.click(within(form).getByRole('button', { name: 'Save the budget' }));
    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says why the server refused a budget', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/budgets', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'owners only' } }, { status: 403 }),
      ),
    );
    visit('/spend');
    const form = await screen.findByRole('region', { name: 'Set a budget' });
    await user.type(within(form).getByRole('textbox', { name: 'Per month ($)' }), '5');
    await user.click(within(form).getByRole('button', { name: 'Save the budget' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('owners only');
  });

  it('shows the budgets without the form to someone who does not manage them', async () => {
    asMember();
    visit('/spend');
    expect(await screen.findByRole('region', { name: 'Budgets' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Set a budget' })).toBeNull();
  });
});
