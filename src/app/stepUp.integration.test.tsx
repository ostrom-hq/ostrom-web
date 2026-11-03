// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server } = setupMockApp();

/** What the server answers a sensitive write from a sign-in more than five minutes old (web audit 2, M3). */
const stale = () =>
  HttpResponse.json(
    { error: { type: 'step_up_required', message: 'sign in again to change this' } },
    { status: 403 },
  );

/** The alert asks for a fresh sign-in, and its link comes back to this screen. */
function expectStepUp(alert: HTMLElement, back: string): void {
  expect(alert).toHaveTextContent('This change needs a sign-in less than five minutes old.');
  expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
    'href',
    `/signin?redirect=${encodeURIComponent(back)}`,
  );
}

describe('a sensitive write from a sign-in too old (web audit 2, M3)', () => {
  it('asks to sign in again before creating a token', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/tokens', stale));
    visit('/tokens');
    const form = await screen.findByRole('region', { name: 'New token' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'CI');
    await user.click(within(form).getByRole('checkbox', { name: 'Usage: Read' }));
    await user.click(within(form).getByRole('button', { name: 'Create the token' }));
    expectStepUp(await within(form).findByRole('alert'), '/tokens');
  });

  it('asks to sign in again before removing a person', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/orgs/:org/members/samir', stale));
    visit('/members');
    const row = await screen.findByRole('listitem', {
      name: (_name, element) => element.textContent.includes('Samir Haddad'),
    });
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    await user.click(within(row).getByRole('button', { name: 'Remove Samir Haddad' }));
    expectStepUp(await screen.findByRole('alert'), '/members');
  });

  it('asks to sign in again before adding an MCP server', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/mcp/servers', stale));
    visit('/mcp');
    const form = await screen.findByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'linear');
    await user.type(within(form).getByRole('textbox', { name: 'URL' }), 'https://a.dev');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    expectStepUp(await screen.findByRole('alert'), '/mcp');
  });

  it('asks to sign in again before saving a secret', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/secrets', stale));
    visit('/secrets');
    const form = await screen.findByRole('region', { name: 'Add a secret' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'A');
    await user.type(within(form).getByLabelText('Value'), 'v');
    await user.click(within(form).getByRole('button', { name: 'Save the secret' }));
    expectStepUp(await screen.findByRole('alert'), '/secrets');
  });

  it('asks to sign in again before saving the provider keys', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/inference/settings', stale));
    visit('/policy');
    const keys = await screen.findByRole('region', { name: 'Provider keys' });
    await user.click(await within(keys).findByRole('button', { name: 'Save' }));
    expectStepUp(await within(keys).findByRole('alert'), '/policy');
  });

  it('asks to sign in again before inviting by e-mail', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/orgs/:org/members/invites', stale));
    visit('/members');
    const invite = await screen.findByRole('region', { name: 'Invite people' });
    await user.type(within(invite).getByRole('textbox'), 'ana@acme.dev');
    await user.click(within(invite).getByRole('button', { name: 'Send 1 invitation' }));
    expectStepUp(await within(invite).findByRole('alert'), '/members');
  });

  it('asks to sign in again before changing how agents name the tools', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/mcp/settings', stale));
    visit('/mcp');
    const section = await screen.findByRole('region', { name: 'Agent names' });
    const field = await within(section).findByRole('textbox', { name: 'Prefix' });
    await user.clear(field);
    await user.type(field, 'acme-ai');
    await user.click(within(section).getByRole('button', { name: 'Save the prefix' }));
    expectStepUp(await within(section).findByRole('alert'), '/mcp');
  });

  it('still says what the server said for any other refusal', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/secrets', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'not yours' } }, { status: 403 }),
      ),
    );
    visit('/secrets');
    const form = await screen.findByRole('region', { name: 'Add a secret' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'A');
    await user.type(within(form).getByLabelText('Value'), 'v');
    await user.click(within(form).getByRole('button', { name: 'Save the secret' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('not yours');
    expect(within(alert).queryByRole('link')).toBeNull();
  });
});
