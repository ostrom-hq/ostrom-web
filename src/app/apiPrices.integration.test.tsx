// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { BUILT_IN_PRICES } from '@/mocks/apiPrices';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'API prices' });
}

async function addRow(
  user: ReturnType<typeof userEvent.setup>,
  box: HTMLElement,
  model: string,
): Promise<void> {
  const form = within(box).getByRole('form', { name: 'Add or replace a price' });
  await user.selectOptions(within(form).getByRole('combobox', { name: 'Provider' }), 'openai');
  await user.type(within(form).getByRole('textbox', { name: 'Model or family prefix' }), model);
  const from = within(form).getByLabelText('Effective from (UTC)');
  fireEvent.change(from, { target: { value: '2026-11-01' } });
  await user.type(within(form).getByRole('textbox', { name: 'Input $ / million tokens' }), '1.25');
  await user.type(within(form).getByRole('textbox', { name: 'Cache read $ / million' }), '0.125');
  await user.type(within(form).getByRole('textbox', { name: 'Output $ / million' }), '10');
  await user.click(within(form).getByRole('button', { name: 'Save the price' }));
}

describe('the API price editor', () => {
  it('shows the built-in prices, adds a row of its own, loads the defaults, then removes a row', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const box = await section();
    expect(await within(box).findByText('Built-in prices')).toBeInTheDocument();
    const table = within(box).getByRole('list', { name: 'Dollars a million tokens.' });
    expect(within(table).getAllByRole('listitem')).toHaveLength(BUILT_IN_PRICES.length);
    expect(within(table).getByText(/Output \$75\.00/)).toBeInTheDocument();
    expect(within(table).getAllByText('anthropic, from 2026-10-21')).toHaveLength(2);
    expect(within(box).queryByRole('button', { name: /^Remove/ })).toBeNull();

    // Editing a built-in row fills the form with it; saving keeps the others.
    await user.click(within(box).getByRole('button', { name: 'Edit claude-sonnet-4 from 2026-10-21' }));
    const edit = within(box).getByRole('form', { name: 'Add or replace a price' });
    expect(within(edit).getByRole('textbox', { name: 'Model or family prefix' })).toHaveValue(
      'claude-sonnet-4',
    );
    const output = within(edit).getByRole('textbox', { name: 'Output $ / million' });
    expect(output).toHaveValue('15');
    await user.clear(output);
    await user.type(output, '16');
    await user.click(within(edit).getByRole('button', { name: 'Save the price' }));
    await within(box).findByText(/Output \$16\.00/);
    expect(db.apiPrices.find((item) => item.model === 'claude-sonnet-4')?.outputMicros).toBe(16_000_000);
    // The same row edited again fills the form again.
    await user.click(within(box).getByRole('button', { name: 'Edit claude-sonnet-4 from 2026-10-21' }));
    expect(within(box).getByRole('textbox', { name: 'Output $ / million' })).toHaveValue('16');
    await user.click(within(box).getByRole('button', { name: 'Save the price' }));
    await within(box).findByRole('button', { name: 'Save the price' });
    await vi.waitFor(() => {
      expect(within(box).getByRole('textbox', { name: 'Model or family prefix' })).toHaveValue('');
    });
    db.apiPrices = [];
    await user.click(within(box).getByRole('button', { name: 'Load current Anthropic prices' }));
    await within(box).findByText(/Output \$15\.00/);
    const form = within(box).getByRole('form', { name: 'Add or replace a price' });
    expect(within(form).getByRole('button', { name: 'Save the price' })).toBeDisabled();

    await addRow(user, box, 'GPT-5');
    expect(await within(box).findByText('gpt-5', { exact: true })).toBeInTheDocument();
    expect(within(box).queryByText('Built-in prices')).toBeNull();
    // The built-in rows shown are kept as the organization's own, with the new one.
    expect(db.apiPrices).toEqual([
      ...BUILT_IN_PRICES,
      {
        provider: 'openai',
        model: 'gpt-5',
        effectiveFrom: '2026-11-01',
        inputMicros: 1_250_000,
        cacheWriteMicros: 0,
        cacheReadMicros: 125_000,
        outputMicros: 10_000_000,
      },
    ]);
    expect(within(form).getByRole('textbox', { name: 'Model or family prefix' })).toHaveValue('');

    await user.click(within(box).getByRole('button', { name: 'Load current Anthropic prices' }));
    await within(box).findByRole('button', { name: 'Load current Anthropic prices' });
    expect(db.apiPrices).toHaveLength(3);
    await user.click(within(box).getByRole('button', { name: 'Remove claude-opus-4 from 2026-10-21' }));
    await within(box).findByRole('button', { name: 'Remove gpt-5 from 2026-11-01' });
    expect(within(box).queryByText('claude-opus-4', { exact: true })).toBeNull();
    expect(db.apiPrices.map((row) => row.model).sort()).toEqual(['claude-sonnet-4', 'gpt-5']);
  }, 20_000);

  it('says when no row prices anything', async () => {
    server.use(
      http.get('*/api/v1/policy/api-prices', () => HttpResponse.json({ prices: [], defaults: false })),
    );
    visit('/policy');
    const box = await section();
    expect(await within(box).findByText(/No price: every model call is unpriced/)).toBeInTheDocument();
  });

  it('asks for a fresh sign-in before a change, and holds the form while one is sent', async () => {
    const user = userEvent.setup();
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1_000;
    visit('/policy');
    const box = await section();
    await within(box).findByRole('list', { name: 'Dollars a million tokens.' });
    await user.click(within(box).getByRole('button', { name: 'Load current Anthropic prices' }));
    const said = await within(box).findByRole('alert');
    expect(said).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(db.apiPrices).toEqual([]);
    server.use(
      http.put('*/api/v1/policy/api-prices', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    const form = within(box).getByRole('form', { name: 'Add or replace a price' });
    fireEvent.submit(form);
    await addRow(user, box, 'gpt-5');
    expect(await within(form).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(within(box).queryByText('This change needs a sign-in less than five minutes old.')).toBeNull();
  }, 20_000);

  it('says why the prices could not be read', async () => {
    server.use(
      http.get('*/api/v1/policy/api-prices', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'prices are down' } }, { status: 500 }),
      ),
    );
    visit('/policy');
    const box = await section();
    expect(await within(box).findByText('prices are down')).toBeInTheDocument();
  });

  it('is not shown to a member, and nothing is asked of the server for one', async () => {
    setDemoRole(db, 'member');
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'maya', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya', avatarUrl: '', role: 'member' },
          capabilities: [],
        }),
      ),
    );
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/policy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent policy' })).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'API prices' })).toBeNull();
    expect(asked).not.toContain('/api/v1/policy/api-prices');
  });

  it('is not shown by a server that does not announce capacity.apiprices.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'capacity.apiprices.v1')),
        ),
      ),
    );
    visit('/policy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent policy' })).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'API prices' })).toBeNull();
  });
});
