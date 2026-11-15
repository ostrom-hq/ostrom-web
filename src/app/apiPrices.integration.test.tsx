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
    const table = within(box).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(BUILT_IN_PRICES.length + 1);
    expect(within(table).getByRole('cell', { name: '$75.00' })).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: /^Remove/ })).toBeNull();
    const form = within(box).getByRole('form', { name: 'Add or replace a price' });
    expect(within(form).getByRole('button', { name: 'Save the price' })).toBeDisabled();

    await addRow(user, box, 'GPT-5');
    expect(await within(box).findByRole('cell', { name: 'gpt-5' })).toBeInTheDocument();
    expect(within(box).queryByText('Built-in prices')).toBeNull();
    expect(db.apiPrices).toEqual([
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
    expect(await within(box).findByRole('cell', { name: 'claude-opus-4' })).toBeInTheDocument();
    expect(db.apiPrices).toHaveLength(3);
    await user.click(within(box).getByRole('button', { name: 'Remove claude-opus-4 from 2026-10-21' }));
    await within(box).findByRole('button', { name: 'Remove gpt-5 from 2026-11-01' });
    expect(within(box).queryByRole('cell', { name: 'claude-opus-4' })).toBeNull();
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
    await within(box).findByRole('table');
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
          member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
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
