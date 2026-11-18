// SPDX-License-Identifier: Apache-2.0
import {
  handleCapabilities,
  handleGetMemberPolicy,
  handleListBudgets,
  handleSavePoolBudget,
  handleSetBudget,
  handleUpdateMemberPolicy,
} from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { fireEvent } from '@testing-library/react';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** The writes the console sends from now on, `METHOD path`. */
function writes(): string[] {
  const sent: string[] = [];
  traffic.onRequest((request) => {
    if (request.method !== 'GET') sent.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return sent;
}

const CAP = 'Optional daily cap (USD, 0 = none)';
const CONCURRENCY = 'Concurrent requests (0 = unlimited)';

/** A pool's form, or a member's card, by its heading. */
async function findCard(name: string | RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('form, article');
  if (!(card instanceof HTMLElement)) throw new Error(`no card ${String(name)}`);
  return card;
}

describe('the capacity page (TeamCode’s pool budgets and member pools)', () => {
  it('lists the pool budgets with their members, and adds a pool in dollars', async () => {
    const user = userEvent.setup();
    visit('/capacity');
    expect(await screen.findByRole('heading', { level: 1, name: 'Capacity' })).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Shared home pool budget and automatic pool size' }),
    ).toHaveAttribute('href', '/pool-size');
    const billing = await findCard('Pool billing');
    expect(await within(billing).findByText('$40.00 a day · 2 members')).toBeVisible();
    expect(within(billing).getByRole('textbox', { name: 'Total daily budget (USD)' })).toHaveValue('40');
    // A saved pool keeps its name: another one would be another pool.
    expect(within(billing).getByRole('textbox', { name: 'Pool' })).toHaveAttribute('readonly');
    expect(within(billing).getByRole('checkbox', { name: /Shared overflow reserve/ })).not.toBeChecked();
    const reserve = await findCard('Pool reserve');
    expect(within(reserve).getByText('Shared overflow reserve')).toBeVisible();
    expect(within(reserve).getByText('$15.00 a day · No primary members')).toBeVisible();
    expect(within(reserve).getByRole('checkbox', { name: /Shared overflow reserve/ })).toBeChecked();

    const add = await findCard('Add or update a pool');
    expect(within(add).getByText('$1.00 a day · New pool: name it and give it a daily budget')).toBeVisible();
    await user.type(within(add).getByRole('textbox', { name: 'Pool' }), 'support');
    const daily = within(add).getByRole('textbox', { name: 'Total daily budget (USD)' });
    await user.clear(daily);
    await user.type(daily, 'abc');
    expect(within(add).getByText('A daily budget is a positive amount, like 40 or 12.50.')).toBeVisible();
    expect(within(add).getByRole('button', { name: 'Save pool budget' })).toBeDisabled();
    await user.clear(daily);
    await user.type(daily, '12.5');
    await user.click(within(add).getByRole('checkbox', { name: /Shared overflow reserve/ }));
    await user.click(within(add).getByRole('button', { name: 'Save pool budget' }));
    const support = await findCard('Pool support');
    expect(await within(support).findByText('$12.50 a day · No primary members')).toBeVisible();
    expect(db.poolBudgets).toContainEqual({
      poolId: 'support',
      dailyMicros: 12_500_000,
      sharedOverflow: true,
    });
    // The new pool's form starts again, empty.
    expect(within(add).getByRole('textbox', { name: 'Pool' })).toHaveValue('');
    expect(within(add).getByRole('checkbox', { name: /Shared overflow reserve/ })).not.toBeChecked();

    // A saved pool's form changes its budget.
    const billingDaily = within(billing).getByRole('textbox', { name: 'Total daily budget (USD)' });
    await user.clear(billingDaily);
    await user.type(billingDaily, '50');
    await user.click(within(billing).getByRole('button', { name: 'Save pool budget' }));
    // Saved, the form starts again from the budget the server answers.
    expect(await screen.findByText('$50.00 a day · 2 members')).toBeVisible();
    expect(
      within(await findCard('Pool billing')).getByRole('textbox', { name: 'Total daily budget (USD)' }),
    ).toHaveValue('50');
  });

  it('words TeamCode’s refusals of a pool budget, and says any other as the server does', async () => {
    const user = userEvent.setup();
    visit('/capacity');
    const billing = await findCard('Pool billing');
    await user.click(within(billing).getByRole('checkbox', { name: /Shared overflow reserve/ }));
    await user.click(within(billing).getByRole('button', { name: 'Save pool budget' }));
    expect(
      await within(billing).findByText(
        'A shared overflow reserve has no primary members: a pool is either some members’ home pool or a shared reserve.',
      ),
    ).toBeVisible();

    const add = await findCard('Add or update a pool');
    await user.type(within(add).getByRole('textbox', { name: 'Pool' }), 'two words');
    await user.click(within(add).getByRole('button', { name: 'Save pool budget' }));
    expect(await within(add).findByText(/Name the pool with 1 to 36 letters/)).toBeVisible();

    server.use(
      handleSavePoolBudget(() =>
        HttpResponse.json({ error: { type: 'overflow_pool_limit', message: 'x' } }, { status: 409 }),
      ),
    );
    await user.click(within(add).getByRole('button', { name: 'Save pool budget' }));
    expect(await within(add).findByText('At most 16 named reserves can be shared.')).toBeVisible();
    server.use(
      handleSavePoolBudget(() =>
        HttpResponse.json(
          { error: { type: 'internal_error', message: 'The server broke.' } },
          { status: 500 },
        ),
      ),
    );
    await user.click(within(add).getByRole('button', { name: 'Save pool budget' }));
    expect(await within(add).findByText('The server broke.')).toBeVisible();
  });

  it('sets a member’s home pool and shared overflow', async () => {
    const user = userEvent.setup();
    visit('/capacity');
    const maya = await findCard(/Maya Lind/);
    expect(await within(maya).findByText('Pool billing · shared overflow allowed')).toBeVisible();
    expect(within(maya).getByText('(you)')).toBeVisible();
    expect(screen.queryByRole('heading', { level: 3, name: /^jo/ })).toBeNull();
    const lena = await findCard('Lena Ortiz');
    expect(await within(lena).findByText('Shared pool · no shared overflow')).toBeVisible();
    expect(within(lena).getByText('Currently Shared pool')).toBeVisible();
    const save = within(lena).getByRole('button', { name: 'Save limits' });
    expect(save).toBeDisabled();
    await user.type(within(lena).getByRole('textbox', { name: 'Pool (empty = shared)' }), 'reserve');
    await user.click(save);
    expect(
      await within(lena).findByText(
        'A shared overflow reserve has no primary members: a pool is either some members’ home pool or a shared reserve.',
      ),
    ).toBeVisible();
    const field = within(lena).getByRole('textbox', { name: 'Pool (empty = shared)' });
    await user.clear(field);
    await user.type(field, 'two words');
    await user.click(within(lena).getByRole('button', { name: 'Save limits' }));
    expect(await within(lena).findByText(/Use a pool name of 1 to 36 letters/)).toBeVisible();
    await user.clear(field);
    await user.type(field, 'support');
    await user.click(within(lena).getByRole('checkbox', { name: 'Allow shared overflow accounts' }));
    await user.click(within(lena).getByRole('button', { name: 'Save limits' }));
    expect(await within(lena).findByText('Pool support · shared overflow allowed')).toBeVisible();
    expect(db.memberPools['lena']).toEqual({ poolId: 'support', allowSharedOverflow: true });
    // The pool's count follows.
    const billing = await findCard('Pool billing');
    expect(await within(billing).findByText('$40.00 a day · 2 members')).toBeVisible();
  });

  it('shows each member’s daily cap and concurrent requests, and saves them with the pool (TeamCode’s « Save limits »)', async () => {
    const user = userEvent.setup();
    visit('/capacity');
    const theo = await findCard('theo');
    expect(
      await within(theo).findByText('Personal cap $25.00 · unlimited concurrent requests'),
    ).toBeVisible();
    expect(within(theo).getByRole('textbox', { name: CAP })).toHaveValue('25');
    expect(within(theo).getByRole('textbox', { name: CAP })).toHaveAccessibleDescription(
      /Currently \$25\.00 a day\./,
    );
    expect(within(theo).getByRole('spinbutton', { name: CONCURRENCY })).toHaveValue(0);
    expect(within(theo).getByRole('spinbutton', { name: CONCURRENCY })).toHaveAccessibleDescription(
      'Requests that may run at once; more requests wait in the queue. Currently unlimited.',
    );

    const lena = await findCard('Lena Ortiz');
    expect(await within(lena).findByText('No personal cap · unlimited concurrent requests')).toBeVisible();
    const cap = within(lena).getByRole('textbox', { name: CAP });
    await user.clear(cap);
    await user.type(cap, '12.5');
    const concurrency = within(lena).getByRole('spinbutton', { name: CONCURRENCY });
    await user.clear(concurrency);
    await user.type(concurrency, '3');
    await user.click(within(lena).getByRole('button', { name: 'Save limits' }));
    expect(await within(lena).findByText('Personal cap $12.50 · 3 concurrent requests')).toBeVisible();
    expect(db.budgets).toContainEqual({
      scope: 'member',
      subject: MEMBER_IDS.lena,
      usdPerDay: 12.5,
      hardStop: true,
    });
    expect(db.inferenceSettings[db.organization.id]?.memberConcurrency).toEqual({ [MEMBER_IDS.lena]: 3 });
    // The rest of the inference settings is written back as it was read.
    expect(db.inferenceSettings[db.organization.id]?.anthropicKeySecret).toBe('ANTHROPIC_API_KEY');
    // Only the cap and the concurrency changed: the pool is not written.
    expect(db.memberPools['lena']).toBeUndefined();

    // 0 is no cap of their own.
    const theoCap = within(theo).getByRole('textbox', { name: CAP });
    await user.clear(theoCap);
    await user.type(theoCap, '0');
    await user.click(within(theo).getByRole('button', { name: 'Save limits' }));
    expect(await within(theo).findByText('No personal cap · unlimited concurrent requests')).toBeVisible();
    expect(db.budgets.some((budget) => budget.subject === MEMBER_IDS.theo)).toBe(false);
  });

  it('reads every member’s cap where a member has none of their own', async () => {
    db.budgets = [...db.budgets, { scope: 'member', usdPerDay: 10, hardStop: true }];
    visit('/capacity');
    const lena = await findCard('Lena Ortiz');
    expect(
      await within(lena).findByText('Every member’s cap $10.00 · unlimited concurrent requests'),
    ).toBeVisible();
    expect(within(lena).getByRole('textbox', { name: CAP })).toHaveValue('0');
    expect(within(lena).getByRole('textbox', { name: CAP })).toHaveAccessibleDescription(
      /Currently every member’s, \$10\.00 a day\./,
    );
  });

  it('never sends a cap or a concurrency that is not one, nor a form that changed nothing', async () => {
    const user = userEvent.setup();
    visit('/capacity');
    const lena = await findCard('Lena Ortiz');
    // Both read: the form no longer starts again.
    await within(lena).findByText('No personal cap · unlimited concurrent requests');
    const cap = within(lena).getByRole('textbox', { name: CAP });
    const save = within(lena).getByRole('button', { name: 'Save limits' });
    const form = save.closest('form');
    if (!(form instanceof HTMLElement)) throw new Error('no form');
    const sent = writes();
    fireEvent.submit(form);
    await user.clear(cap);
    await user.type(cap, 'abc');
    expect(within(lena).getByText('A daily cap is an amount like 25 or 12.50, or 0 for none.')).toBeVisible();
    expect(save).toBeDisabled();
    fireEvent.submit(form);
    await user.clear(cap);
    await user.type(cap, '5');
    const concurrency = within(lena).getByRole('spinbutton', { name: CONCURRENCY });
    await user.clear(concurrency);
    await user.type(concurrency, '40');
    expect(save).toBeDisabled();
    fireEvent.submit(form);
    expect(sent).toEqual([]);
  });

  it('says why a cap was not saved', async () => {
    const user = userEvent.setup();
    server.use(
      handleSetBudget(() =>
        HttpResponse.json(
          { error: { type: 'internal_error', message: 'Budgets are down.' } },
          { status: 500 },
        ),
      ),
    );
    visit('/capacity');
    const lena = await findCard('Lena Ortiz');
    await within(lena).findByText('No personal cap · unlimited concurrent requests');
    const cap = within(lena).getByRole('textbox', { name: CAP });
    await user.clear(cap);
    await user.type(cap, '5');
    await user.click(within(lena).getByRole('button', { name: 'Save limits' }));
    expect(await within(lena).findByText('Budgets are down.')).toBeVisible();
  });

  it('leaves out the concurrency without the admission queue', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'inference.queue.v1'))),
      ),
    );
    visit('/capacity');
    const theo = await findCard('theo');
    expect(await within(theo).findByText('Personal cap $25.00')).toBeVisible();
    expect(within(theo).queryByRole('spinbutton', { name: CONCURRENCY })).toBeNull();
  });

  it('leaves out the cap, and the line, when neither can be read', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'inference.queue.v1'))),
      ),
      handleListBudgets(() =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'No.' } }, { status: 403 }),
      ),
    );
    visit('/capacity');
    const theo = await findCard('theo');
    await within(theo).findByRole('textbox', { name: 'Pool (empty = shared)' });
    expect(within(theo).queryByRole('textbox', { name: CAP })).toBeNull();
    expect(within(theo).queryByText(/Personal cap|concurrent requests/)).toBeNull();
  });

  it('shows a member their own pool only, without forms', async () => {
    setDemoRole(db, 'member');
    visit('/capacity');
    expect(await screen.findByText('Pool billing · shared overflow allowed')).toBeVisible();
    expect(screen.queryByText('Pool budgets')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save limits' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('says it is saving, and never sends a budget that is no amount', async () => {
    const user = userEvent.setup();
    const sent: string[] = [];
    server.use(
      handleSavePoolBudget(async () => {
        sent.push('budget');
        await delay('infinite');
        return HttpResponse.json({ poolId: 'x', dailyMicros: 1 });
      }),
      handleUpdateMemberPolicy(async () => {
        await delay('infinite');
        return HttpResponse.json({ member: 'lena', allowSharedOverflow: true });
      }),
    );
    visit('/capacity');
    const add = await findCard('Add or update a pool');
    await user.type(within(add).getByRole('textbox', { name: 'Pool' }), 'x');
    const daily = within(add).getByRole('textbox', { name: 'Total daily budget (USD)' });
    await user.clear(daily);
    fireEvent.submit(add);
    expect(sent).toEqual([]);
    await user.type(daily, '3');
    await user.click(within(add).getByRole('button', { name: 'Save pool budget' }));
    expect(await within(add).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    const lena = await findCard('Lena Ortiz');
    await user.click(await within(lena).findByRole('checkbox', { name: 'Allow shared overflow accounts' }));
    await user.click(within(lena).getByRole('button', { name: 'Save limits' }));
    expect(await within(lena).findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says why the members’ pools could not be read', async () => {
    server.use(
      handleGetMemberPolicy(() =>
        HttpResponse.json(
          { error: { type: 'internal_error', message: 'Policies are down.' } },
          { status: 500 },
        ),
      ),
    );
    visit('/capacity');
    expect(await screen.findByText('Policies are down.')).toBeVisible();
  });

  it('is in a member’s navigation', async () => {
    setDemoRole(db, 'member');
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Capacity' })).toHaveAttribute('href', '/capacity');
  });

  it('links the pool size only where the server sizes it', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((key) => key !== 'capacity.poolsize.v1'))),
      ),
    );
    visit('/capacity');
    await findCard('Pool billing');
    expect(screen.queryByRole('link', { name: /automatic pool size/ })).toBeNull();
  });
});
