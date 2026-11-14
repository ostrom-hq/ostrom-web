// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

async function received(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'What your agents receive' }, { timeout: 5_000 });
}

async function ownRow(variable: string): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Your own values' }, { timeout: 5_000 });
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(variable) !== null);
  if (row === undefined) throw new Error(`no variant ${variable}`);
  return row;
}

describe('the person’s own environment', { timeout: 15_000 }, () => {
  it('names what their agents receive, never a value', async () => {
    visit('/me/environment');
    expect(await received()).toHaveTextContent('GITHUB_TOKEN');
    expect(document.body).not.toHaveTextContent('demo-value-of');
    expect(
      screen.getByText('Names only: the values go to your agents, never to this page.'),
    ).toBeInTheDocument();
    expect(screen.getByText('You have not declared any value of your own.')).toBeInTheDocument();
  });

  it('says which assigned variables are withheld', async () => {
    db.environmentUnavailable = ['NPM_TOKEN'];
    visit('/me/environment');
    expect(
      await screen.findByText(/Assigned but withheld, because its value cannot be read now: NPM_TOKEN/),
    ).toBeInTheDocument();
  });

  it('says when nothing is assigned, and when the names cannot be read', async () => {
    db.environmentAssignments = [];
    visit('/me/environment');
    expect(await screen.findByText('Nothing is assigned to you yet.')).toBeInTheDocument();
  });

  it('says why the names cannot be read', async () => {
    server.use(
      http.get('*/api/v1/environment', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'a person only' } }, { status: 403 }),
      ),
    );
    visit('/me/environment');
    expect(await screen.findByText('a person only')).toBeInTheDocument();
  });

  it('adds a value of their own, sent once, which their agents then receive', async () => {
    const user = userEvent.setup();
    visit('/me/environment');
    const form = await screen.findByRole('region', { name: 'Add a value of your own' });
    expect(within(form).queryByText('Who provides the value')).toBeNull();
    await user.type(within(form).getByLabelText('Variable name'), 'LINEAR_API_KEY');
    await user.type(within(form).getByLabelText('Variant name'), 'mine');
    await user.type(within(form).getByLabelText('Value', { exact: true }), 'sk-my-own');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    const row = await ownRow('LINEAR_API_KEY');
    expect(row).toHaveTextContent('v1 · shared value stored');
    expect(row).not.toHaveTextContent('per member');
    expect(await received()).toHaveTextContent('LINEAR_API_KEY');
    expect(document.body).not.toHaveTextContent('sk-my-own');
    expect(db.environmentVariants.find((variant) => variant.variable === 'LINEAR_API_KEY')?.owner).toBe(
      MEMBER_IDS.maya,
    );
  });

  it('is refused a variable an administrator already assigned or excluded them from', async () => {
    const user = userEvent.setup();
    visit('/me/environment');
    const form = await screen.findByRole('region', { name: 'Add a value of your own' });
    await user.type(within(form).getByLabelText('Variable name'), 'GITHUB_TOKEN');
    await user.type(within(form).getByLabelText('Variant name'), 'mine');
    await user.type(within(form).getByLabelText('Value', { exact: true }), 'ghp_mine');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You already receive this variable.');
  });

  it('renames one, replaces its value and deletes it', async () => {
    db.environmentVariants.push({
      id: 'env-mine',
      variable: 'LINEAR_KEY',
      name: 'mine',
      binding: 'shared',
      owner: MEMBER_IDS.maya,
      hasValue: true,
      version: 1,
      createdAt: '2026-10-02T09:00:00.000Z',
      updatedAt: '2026-10-02T09:00:00.000Z',
    });
    const user = userEvent.setup();
    visit('/me/environment');
    const row = await ownRow('LINEAR_KEY');
    await user.click(within(row).getByRole('button', { name: 'Edit LINEAR_KEY: mine' }));
    await user.clear(within(row).getByLabelText('Variant name'));
    await user.type(within(row).getByLabelText('Variant name'), 'personal');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect(await ownRow('LINEAR_KEY')).toHaveTextContent('v2');
    });
    expect(await ownRow('LINEAR_KEY')).toHaveTextContent('personal');
    const after = await ownRow('LINEAR_KEY');
    await user.click(within(after).getByRole('button', { name: 'Edit LINEAR_KEY: personal' }));
    await user.type(within(after).getByLabelText('New value (optional)'), 'lin_newer');
    await user.click(within(after).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      expect(await ownRow('LINEAR_KEY')).toHaveTextContent('v3');
    });
    const last = await ownRow('LINEAR_KEY');
    await user.click(within(last).getByRole('button', { name: 'Delete' }));
    await user.click(within(last).getByRole('button', { name: 'Delete LINEAR_KEY: personal' }));
    expect(await screen.findByText('You have not declared any value of your own.')).toBeInTheDocument();
  });

  it('says why their variants cannot be read', async () => {
    server.use(
      http.get('*/api/v1/me/environment/variants', () =>
        HttpResponse.json({ error: { type: 'unavailable', message: 'mine are down' } }, { status: 503 }),
      ),
    );
    visit('/me/environment');
    expect(await screen.findByText('mine are down')).toBeInTheDocument();
  });

  it('never shows another organization’s values or variants', async () => {
    db.otherOrganizations = [otherOrganization()];
    const headers = { 'Ostrom-Org': otherOrganization().id };
    const environment: unknown = await (await fetch(`${TEST_API}/api/v1/environment`, { headers })).json();
    expect(environment).toEqual({ variables: {}, unavailable: [] });
    const mine: unknown = await (
      await fetch(`${TEST_API}/api/v1/me/environment/variants`, { headers })
    ).json();
    expect(mine).toEqual({ items: [] });
  });
});
