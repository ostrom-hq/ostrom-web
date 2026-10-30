// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
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

async function findServer(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  if (card === null) throw new Error(`no server ${name}`);
  return card;
}

function secretRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (row === null) throw new Error(`no secret ${name}`);
  return row;
}

describe('the MCP servers', () => {
  it('shows each server with its state, tools, secrets and calls, then the recent calls', async () => {
    visit('/mcp');
    expect(await screen.findByRole('heading', { level: 1, name: 'MCP servers' })).toBeInTheDocument();
    const linear = await findServer('linear');
    expect(linear).toHaveTextContent('On');
    expect(linear).toHaveTextContent('SSE');
    expect(linear).toHaveTextContent('https://mcp.linear.app/sse');
    expect(linear).toHaveTextContent(
      'Scope org · 3 calls · Tools list_issues, create_issue, update_issue · Uses LINEAR_TOKEN',
    );
    const sentry = await findServer('sentry');
    expect(sentry).toHaveTextContent('Off');
    expect(sentry).toHaveTextContent('HTTP');
    expect(sentry).toHaveTextContent('Scope team:billing · 0 calls · No secret');
    const recent = within(screen.getByRole('region', { name: 'Recent calls' })).getAllByRole('listitem');
    expect(recent).toHaveLength(3);
    expect(recent[0]).toHaveTextContent('linear · create_issue');
    expect(recent[0]).toHaveTextContent(/theo · .* · 412 ms/);
    expect(recent[0]).toHaveTextContent('OK');
    expect(recent[1]).toHaveTextContent('Failed');
    expect(recent[1]).not.toHaveTextContent(' ms');
  });

  it('says which secret a server lacks, and shows a transport it has no word for as is', async () => {
    db.mcpServers = db.mcpServers.map((item) =>
      item.name === 'linear' ? { ...item, secretNames: ['LINEAR_TOKEN', 'GONE'], tools: [] } : item,
    );
    db.mcpServers.push({
      name: 'local',
      url: 'https://x.dev',
      transport: 'stdio',
      secretNames: ['A', 'B'],
      enabled: true,
      scope: 'org',
    });
    visit('/mcp');
    const linear = await findServer('linear');
    expect(
      await within(linear).findByText('Missing secret GONE: its calls fail until it exists.'),
    ).toBeInTheDocument();
    expect(linear).not.toHaveTextContent('Tools');
    const local = await findServer('local');
    expect(local).toHaveTextContent('stdio');
    expect(within(local).getByText(/Missing secrets A, B/)).toBeInTheDocument();
  });

  it('adds a server once what is typed is right, then clears the form', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const form = await screen.findByRole('region', { name: 'Add a server' });
    const add = within(form).getByRole('button', { name: 'Add the server' });
    await user.click(add);
    expect(within(form).getByText(/The name is lowercase/)).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'notion');
    expect(within(form).getByText(/The URL starts with https/)).toBeInTheDocument();
    await user.type(within(form).getByRole('textbox', { name: 'URL' }), 'https://mcp.notion.com/mcp');
    await user.type(within(form).getByRole('textbox', { name: /Secrets it needs/ }), 'notion_key');
    expect(
      within(form).getByText('notion_key is not a secret name: CAPITALS, digits and underscores.'),
    ).toBeInTheDocument();
    await user.clear(within(form).getByRole('textbox', { name: /Secrets it needs/ }));
    await user.type(within(form).getByRole('textbox', { name: /Secrets it needs/ }), 'NOTION_KEY');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Transport' }), 'sse');
    fireEvent.change(within(form).getByRole('combobox', { name: 'Transport' }), {
      target: { value: 'stdio' },
    });
    await user.click(add);
    const notion = await findServer('notion');
    expect(notion).toHaveTextContent('SSE');
    expect(within(notion).getByText(/Missing secret NOTION_KEY/)).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(form).queryByText(/is not a secret name/)).toBeNull();
  });

  it('holds the form while a server is added, and says why the server refused it', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/mcp/servers', async () => delay('infinite')));
    visit('/mcp');
    const form = await screen.findByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'linear');
    await user.type(within(form).getByRole('textbox', { name: 'URL' }), 'https://a.dev');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    expect(within(form).getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('says when a server with that name exists', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const form = await screen.findByRole('region', { name: 'Add a server' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'linear');
    await user.type(within(form).getByRole('textbox', { name: 'URL' }), 'https://a.dev');
    await user.click(within(form).getByRole('button', { name: 'Add the server' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('an MCP server named linear exists');
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('linear');
  });

  it('turns a server off and on', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const linear = await findServer('linear');
    await user.click(within(linear).getByRole('button', { name: 'Turn off' }));
    expect(await within(linear).findByText('Off')).toBeInTheDocument();
    await user.click(within(linear).getByRole('button', { name: 'Turn on' }));
    expect(await within(linear).findByText('On')).toBeInTheDocument();
  });

  it('holds every server while one is saved', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/mcp/servers/:name', async () => delay('infinite')));
    visit('/mcp');
    await user.click(within(await findServer('linear')).getByRole('button', { name: 'Turn off' }));
    expect(within(await findServer('sentry')).getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('removes a server after a second, explicit click, or keeps it', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const sentry = await findServer('sentry');
    await user.click(within(sentry).getByRole('button', { name: 'Remove' }));
    await user.click(within(sentry).getByRole('button', { name: 'Keep' }));
    await user.click(within(sentry).getByRole('button', { name: 'Remove' }));
    await user.click(within(sentry).getByRole('button', { name: 'Remove sentry' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'linear' })).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'sentry' })).toBeNull();
    });
  });

  it('holds the removal while it is sent', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/mcp/servers/:name', async () => delay('infinite')));
    visit('/mcp');
    const sentry = await findServer('sentry');
    await user.click(within(sentry).getByRole('button', { name: 'Remove' }));
    await user.click(within(sentry).getByRole('button', { name: 'Remove sentry' }));
    expect(within(sentry).getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('shows the servers without the form or buttons to someone who does not manage them', async () => {
    asMember();
    visit('/mcp');
    expect(await findServer('linear')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Add a server' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
  });

  it('says when there is no server and no call, and counts nothing while the usage loads', async () => {
    server.use(
      http.get('*/api/v1/mcp/servers', () => HttpResponse.json({ items: [] })),
      http.get('*/api/v1/mcp/calls', () => HttpResponse.json({ items: [] })),
    );
    visit('/mcp');
    expect(await screen.findByText(/No MCP server yet/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recent calls' })).toBeNull();
  });

  it('shows the servers before the usage and the secrets arrive', async () => {
    server.use(
      http.get('*/api/v1/mcp/usage', never),
      http.get('*/api/v1/secrets', never),
      http.get('*/api/v1/mcp/calls', never),
    );
    visit('/mcp');
    const linear = await findServer('linear');
    expect(linear).toHaveTextContent('0 calls');
    expect(within(linear).queryByText(/Missing/)).toBeNull();
  });

  it('says why the servers do not come', async () => {
    server.use(http.get('*/api/v1/mcp/servers', () => HttpResponse.error()));
    visit('/mcp');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('the secrets', () => {
  it('lists each secret with its scope, who changed it and what uses it, never a value', async () => {
    visit('/secrets');
    expect(await screen.findByRole('heading', { level: 1, name: 'Secrets' })).toBeInTheDocument();
    expect(await screen.findByText('LINEAR_TOKEN')).toBeInTheDocument();
    expect(secretRow('LINEAR_TOKEN')).toHaveTextContent(
      /Scope org · Changed by maya · .* · Used by mcp:linear/,
    );
    expect(secretRow('STRIPE_TEST_KEY')).toHaveTextContent(
      /Scope team:billing · Changed by samir · .* · Not used yet/,
    );
  });

  it('saves a new secret only with a right name and a value, and empties the value', async () => {
    const user = userEvent.setup();
    visit('/secrets');
    const form = await screen.findByRole('region', { name: 'Add a secret' });
    const save = within(form).getByRole('button', { name: 'Save the secret' });
    expect(save).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'npm token');
    expect(within(form).getByText(/A secret name is CAPITALS/)).toBeInTheDocument();
    await user.clear(within(form).getByRole('textbox', { name: 'Name' }));
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'NPM_TOKEN');
    expect(save).toBeDisabled();
    const value = within(form).getByLabelText('Value');
    expect(value).toHaveAttribute('type', 'password');
    await user.type(value, 's3cret');
    await user.click(save);
    expect(await screen.findByText('NPM_TOKEN')).toBeInTheDocument();
    expect(value).toHaveValue('');
    expect(document.body).not.toHaveTextContent('s3cret');
  });

  it('holds the form while a secret is saved, and says when the name is taken', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/secrets', async () => delay('infinite')));
    visit('/secrets');
    const form = await screen.findByRole('region', { name: 'Add a secret' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'A');
    await user.type(within(form).getByLabelText('Value'), 'v');
    await user.click(within(form).getByRole('button', { name: 'Save the secret' }));
    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says when a secret with that name exists', async () => {
    const user = userEvent.setup();
    visit('/secrets');
    const form = await screen.findByRole('region', { name: 'Add a secret' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'LINEAR_TOKEN');
    await user.type(within(form).getByLabelText('Value'), 'v');
    await user.click(within(form).getByRole('button', { name: 'Save the secret' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('a secret named LINEAR_TOKEN exists');
  });

  it('replaces a value, or gives up, and never shows it', async () => {
    const user = userEvent.setup();
    visit('/secrets');
    await screen.findByText('STRIPE_TEST_KEY');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Replace the value' }));
    await user.type(within(secretRow('STRIPE_TEST_KEY')).getByLabelText('New value of STRIPE_TEST_KEY'), 'x');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Cancel' }));
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Replace the value' }));
    const field = within(secretRow('STRIPE_TEST_KEY')).getByLabelText('New value of STRIPE_TEST_KEY');
    expect(field).toHaveValue('');
    expect(
      within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Save the value' }),
    ).toBeDisabled();
    await user.type(field, 'rotated');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Save the value' }));
    expect(await within(secretRow('STRIPE_TEST_KEY')).findByText(/Changed by maya/)).toBeInTheDocument();
    expect(within(secretRow('STRIPE_TEST_KEY')).queryByRole('button', { name: 'Save the value' })).toBeNull();
  });

  it('says why a secret in use cannot be removed, and removes one that is not', async () => {
    const user = userEvent.setup();
    visit('/secrets');
    await screen.findByText('LINEAR_TOKEN');
    await user.click(within(secretRow('LINEAR_TOKEN')).getByRole('button', { name: 'Remove' }));
    await user.click(within(secretRow('LINEAR_TOKEN')).getByRole('button', { name: 'Remove LINEAR_TOKEN' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('the MCP server linear uses this secret');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Remove' }));
    await user.click(
      within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Remove STRIPE_TEST_KEY' }),
    );
    await vi.waitFor(() => {
      expect(screen.queryByText('STRIPE_TEST_KEY')).toBeNull();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('holds every secret while one is replaced', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/secrets/:name', async () => delay('infinite')));
    visit('/secrets');
    await screen.findByText('STRIPE_TEST_KEY');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Replace the value' }));
    await user.type(within(secretRow('STRIPE_TEST_KEY')).getByLabelText(/New value/), 'x');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Save the value' }));
    expect(
      within(secretRow('LINEAR_TOKEN')).getByRole('button', { name: 'Replace the value' }),
    ).toBeDisabled();
  });

  it('holds every secret while one is removed', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/secrets/:name', async () => delay('infinite')));
    visit('/secrets');
    await screen.findByText('STRIPE_TEST_KEY');
    await user.click(within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Remove' }));
    await user.click(
      within(secretRow('STRIPE_TEST_KEY')).getByRole('button', { name: 'Remove STRIPE_TEST_KEY' }),
    );
    expect(within(secretRow('LINEAR_TOKEN')).getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('shows the secrets without any change to someone who does not manage them', async () => {
    asMember();
    visit('/secrets');
    expect(await screen.findByText('LINEAR_TOKEN')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Add a secret' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace the value' })).toBeNull();
  });

  it('says when there is no secret', async () => {
    server.use(http.get('*/api/v1/secrets', () => HttpResponse.json({ items: [] })));
    visit('/secrets');
    expect(await screen.findByText('No secret yet.')).toBeInTheDocument();
  });
});
