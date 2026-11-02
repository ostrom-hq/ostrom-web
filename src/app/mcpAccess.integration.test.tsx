// SPDX-License-Identifier: AGPL-3.0-only
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';

const { server, db } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

async function findServer(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  if (card === null) throw new Error(`no server ${name}`);
  return card;
}

/** Opens who may use a server, and waits for its lists. */
async function openAccess(name: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const card = await findServer(name);
  await user.click(within(card).getByRole('button', { name: 'Who may use it' }));
  await within(card).findByRole('heading', { level: 4, name: 'Argument policies' });
  return card;
}

function prefixSection(): HTMLElement {
  return screen.getByRole('region', { name: 'Agent names' });
}

describe('the agent prefix', () => {
  it('shows how agents name a tool, and an admin changes the prefix', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    await findServer('linear');
    const section = prefixSection();
    expect(await within(section).findByText('mcp__ostrom-linear__<tool>')).toBeInTheDocument();
    const field = within(section).getByRole('textbox', { name: 'Prefix' });
    const save = within(section).getByRole('button', { name: 'Save the prefix' });
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, 'Acme AI');
    // A prefix the relay refuses keeps the last good name in the example.
    expect(within(section).getByText('mcp__ostrom-linear__<tool>')).toBeInTheDocument();
    await user.click(save);
    expect(within(section).getByRole('alert')).toHaveTextContent(/The prefix is 1 to 32 lowercase letters/);
    await user.clear(field);
    await user.type(field, 'acme-ai');
    expect(within(section).getByText('mcp__acme-ai-linear__<tool>')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => {
      expect(db.mcpPrefixes[ACME]).toBe('acme-ai');
    });
    expect(within(section).queryByRole('alert')).toBeNull();
    expect(field).toHaveValue('acme-ai');
    expect(within(section).getByRole('button', { name: 'Save the prefix' })).toBeDisabled();
  });

  it('holds the button while the prefix is saved, and says why the server refused it', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/mcp/settings', async () => delay('infinite')));
    visit('/mcp');
    await findServer('linear');
    const field = await within(prefixSection()).findByRole('textbox', { name: 'Prefix' });
    await user.clear(field);
    await user.type(field, 'acme');
    await user.click(within(prefixSection()).getByRole('button', { name: 'Save the prefix' }));
    expect(within(prefixSection()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says why a prefix was not saved', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/mcp/settings', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'settings are down' } }, { status: 500 }),
      ),
    );
    visit('/mcp');
    await findServer('linear');
    const field = await within(prefixSection()).findByRole('textbox', { name: 'Prefix' });
    await user.clear(field);
    await user.type(field, 'acme');
    await user.click(within(prefixSection()).getByRole('button', { name: 'Save the prefix' }));
    expect(await within(prefixSection()).findByRole('alert')).toHaveTextContent('settings are down');
  });

  it('reads the prefix for a member, with nothing to change, and the example of an empty list', async () => {
    setDemoRole(db, 'member');
    db.mcpServers = [];
    visit('/mcp');
    expect(await screen.findByText('The prefix is ostrom; owners and admins change it.')).toBeInTheDocument();
    expect(within(prefixSection()).getByText('mcp__ostrom-<server>__<tool>')).toBeInTheDocument();
    expect(within(prefixSection()).queryByRole('textbox')).toBeNull();
    expect(
      screen.getByText('Owners and admins choose who may use each server and which calls it refuses.'),
    ).toBeInTheDocument();
  });

  it('says why the prefix did not load', async () => {
    server.use(
      http.get('*/api/v1/mcp/settings', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'no settings' } }, { status: 500 }),
      ),
    );
    visit('/mcp');
    await findServer('linear');
    expect(
      await within(prefixSection()).findByText('no settings', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });
});

describe('who may use a server', () => {
  it('lists everyone first, then each member, with their tools and their credential', async () => {
    db.mcpAssignments['linear'] = [
      ...(db.mcpAssignments['linear'] ?? []),
      {
        server: 'linear',
        member: MEMBER_IDS.maya,
        tools: [],
        credentialSecret: 'MAYA_LINEAR',
        assignedAt: '2026-10-24T09:00:00.000Z',
      },
      { server: 'linear', member: 'gone-1', assignedAt: '2026-10-25T09:00:00.000Z' },
    ];
    visit('/mcp');
    const card = await openAccess('linear');
    const rows = within(within(card).getByRole('list', { name: 'Who may use linear' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('EveryoneEvery tool'),
      expect.stringContaining('theoTools list_issues, create_issue'),
      expect.stringContaining('Maya Lind (maya)No tool · Own credential MAYA_LINEAR'),
      expect.stringContaining('Former member gone-1Every tool'),
    ]);
  });

  it('says a server is given to nobody, and hides the lists again', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('sentry');
    expect(within(card).getByText('Nobody yet: give it to everyone or to one member.')).toBeInTheDocument();
    expect(
      within(card).getByText('No policy: every call the assignment allows goes through.'),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Hide who may use it' }));
    expect(within(card).queryByRole('heading', { level: 4 })).toBeNull();
  });

  it('names a member by id when the members cannot be read', async () => {
    server.use(
      http.get('*/api/v1/members', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'no' } }, { status: 403 }),
      ),
    );
    visit('/mcp');
    const card = await openAccess('linear');
    expect(within(card).getByText(MEMBER_IDS.theo)).toHaveClass('o-mono');
  });

  it('says why the lists did not load', async () => {
    server.use(
      http.get('*/api/v1/mcp/servers/:name/assignments', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'admins only' } }, { status: 403 }),
      ),
    );
    const user = userEvent.setup();
    visit('/mcp');
    const card = await findServer('linear');
    await user.click(within(card).getByRole('button', { name: 'Who may use it' }));
    expect(await within(card).findByText('admins only', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('gives a member some tools with their own credential, then takes it back', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('sentry');
    const form = within(card).getByRole('form', { name: 'Give sentry' });
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Give it to' }),
      'Samir Haddad (samir)',
    );
    // An invitation not accepted yet is not offered.
    expect(within(form).queryByRole('option', { name: 'jo' })).toBeNull();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Tools' }), 'Only these tools');
    await user.type(within(form).getByRole('textbox', { name: /Allowed tools/ }), 'search_issues, get/issue');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('get/issue is not a tool name');
    await user.clear(within(form).getByRole('textbox', { name: /Allowed tools/ }));
    await user.type(within(form).getByRole('textbox', { name: /Allowed tools/ }), 'search_issues');
    await user.type(within(form).getByRole('textbox', { name: /Their own credential/ }), 'samir_key');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('A personal credential is a secret name');
    await user.clear(within(form).getByRole('textbox', { name: /Their own credential/ }));
    await user.type(within(form).getByRole('textbox', { name: /Their own credential/ }), 'SAMIR_KEY');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    const list = await within(card).findByRole('list', { name: 'Who may use sentry' });
    expect(list).toHaveTextContent('Samir Haddad (samir)Tools search_issues · Own credential SAMIR_KEY');
    expect(db.mcpAssignments['sentry']).toEqual([
      expect.objectContaining({
        member: MEMBER_IDS.samir,
        tools: ['search_issues'],
        credentialSecret: 'SAMIR_KEY',
      }),
    ]);
    expect(within(form).getByRole('combobox', { name: 'Give it to' })).toHaveValue('all');

    await user.click(within(list).getByRole('button', { name: 'Take back' }));
    await user.click(within(list).getByRole('button', { name: 'Take it back from Samir Haddad (samir)' }));
    expect(
      await within(card).findByText('Nobody yet: give it to everyone or to one member.'),
    ).toBeInTheDocument();
  });

  it('drops a credential typed for a member once the server goes to everyone', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('sentry');
    const form = within(card).getByRole('form', { name: 'Give sentry' });
    await user.selectOptions(
      within(form).getByRole('combobox', { name: 'Give it to' }),
      'Samir Haddad (samir)',
    );
    await user.type(within(form).getByRole('textbox', { name: /Their own credential/ }), 'SAMIR_KEY');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Give it to' }), 'Everyone');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(await within(card).findByRole('list', { name: 'Who may use sentry' })).toHaveTextContent(
      'EveryoneEvery tool',
    );
    expect(db.mcpAssignments['sentry']).toEqual([
      expect.not.objectContaining({ credentialSecret: 'SAMIR_KEY' }),
    ]);
  });

  it('takes the server back from everyone', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('linear');
    const list = within(card).getByRole('list', { name: 'Who may use linear' });
    await user.click(within(list).getAllByRole('button', { name: 'Take back' })[0] ?? list);
    await user.click(within(list).getByRole('button', { name: 'Take it back from Everyone' }));
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(db.mcpAssignments['linear']?.map((item) => item.member)).toEqual([MEMBER_IDS.theo]);
  });

  it('gives everyone the server, and a member by id, saying when the id is nobody', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('sentry');
    const form = within(card).getByRole('form', { name: 'Give sentry' });
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    const list = await within(card).findByRole('list', { name: 'Who may use sentry' });
    expect(list).toHaveTextContent('EveryoneEvery tool');

    await user.selectOptions(within(form).getByRole('combobox', { name: 'Give it to' }), 'A member, by id…');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Say whom to give it to');
    await user.type(within(form).getByRole('textbox', { name: 'Member id' }), 'nobody-1');
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(await within(card).findByText('member not found')).toBeInTheDocument();
    // The next gesture clears the failure of the last one.
    await user.clear(within(form).getByRole('textbox', { name: 'Member id' }));
    await user.type(within(form).getByRole('textbox', { name: 'Member id' }), MEMBER_IDS.theo);
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(await within(list).findByText('theo')).toBeInTheDocument();
    expect(within(card).queryByText('member not found')).toBeNull();
  });

  it('holds the forms while a change is saved', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/mcp/servers/:name/assignments/:member', async () => delay('infinite')));
    visit('/mcp');
    const card = await openAccess('linear');
    const form = within(card).getByRole('form', { name: 'Give linear' });
    await user.click(within(form).getByRole('button', { name: 'Give access' }));
    expect(within(form).getByRole('button', { name: 'Give access' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Add the policy' })).toBeDisabled();
  });
});

describe('the argument policies', () => {
  it('lists what each policy refuses or holds, and what the agent is told', async () => {
    visit('/mcp');
    const card = await openAccess('linear');
    const rows = within(within(card).getByRole('list', { name: 'Argument policies of linear' })).getAllByRole(
      'listitem',
    );
    expect(rows[0]).toHaveTextContent('create_issueRefuseteam is SEC');
    expect(rows[0]).toHaveTextContent('The agent is told: “Security issues are filed by hand.”');
    expect(rows[1]).toHaveTextContent('Every toolAsk for a yesEvery call');
  });

  it('adds a policy with its conditions once what is typed is right', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('sentry');
    const form = within(card).getByRole('form', { name: 'New argument policy for sentry' });
    const submit = within(form).getByRole('button', { name: 'Add the policy' });
    await user.click(submit);
    expect(within(form).getByRole('alert')).toHaveTextContent('Name one tool');
    await user.type(within(form).getByRole('textbox', { name: 'Tool (* for every tool)' }), 'run_query');
    await user.click(submit);
    expect(within(form).getByRole('alert')).toHaveTextContent('Say in 1 to 500 characters');
    await user.type(within(form).getByRole('textbox', { name: 'What the agent is told' }), 'Ask the DBA.');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Then' }), 'Ask for a yes');
    await user.click(within(form).getByRole('button', { name: 'Add a condition' }));
    await user.click(submit);
    expect(within(form).getByRole('alert')).toHaveTextContent('Each condition names an argument');
    await user.type(within(form).getByRole('textbox', { name: 'Argument of condition 1' }), 'query');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Test of condition 1' }), 'contains');
    await user.click(submit);
    expect(within(form).getByRole('alert')).toHaveTextContent('This test needs a value');
    await user.type(within(form).getByRole('textbox', { name: 'Value of condition 1' }), 'DROP');
    await user.click(within(form).getByRole('button', { name: 'Add a condition' }));
    await user.type(
      within(form).getByRole('textbox', { name: 'Argument of condition 2' }),
      'options.database',
    );
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Test of condition 2' }), 'is set');
    expect(within(form).queryByRole('textbox', { name: 'Value of condition 2' })).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Add a condition' }));
    await user.click(within(form).getByRole('button', { name: 'Remove condition 3' }));
    await user.click(submit);
    const list = await within(card).findByRole('list', { name: 'Argument policies of sentry' });
    expect(list).toHaveTextContent('run_queryAsk for a yesquery contains DROP and options.database is set');
    expect(db.mcpPolicies['sentry']?.[0]).toMatchObject({
      tool: 'run_query',
      effect: 'REQUIRE_APPROVAL',
      conditions: [
        { path: 'query', operator: 'CONTAINS', value: 'DROP' },
        { path: 'options.database', operator: 'EXISTS' },
      ],
    });
    expect(within(form).getByRole('textbox', { name: 'Tool (* for every tool)' })).toHaveValue('');
    expect(within(form).queryByRole('textbox', { name: 'Argument of condition 1' })).toBeNull();
  });

  it('refuses a test it does not know and a policy the server refuses', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/mcp/servers/:name/policies', () =>
        HttpResponse.json({ error: { type: 'invalid_request', message: 'unsafe pattern' } }, { status: 400 }),
      ),
    );
    visit('/mcp');
    const card = await openAccess('sentry');
    const form = within(card).getByRole('form', { name: 'New argument policy for sentry' });
    await user.type(within(form).getByRole('textbox', { name: 'Tool (* for every tool)' }), '*');
    await user.type(within(form).getByRole('textbox', { name: 'What the agent is told' }), 'No.');
    await user.click(within(form).getByRole('button', { name: 'Add a condition' }));
    const operator = within(form).getByRole('combobox', { name: 'Test of condition 1' });
    const effect = within(form).getByRole('combobox', { name: 'Then' });
    // Values outside the lists are ignored: the choice stays.
    operator.appendChild(new Option('LIKE', 'LIKE'));
    effect.appendChild(new Option('ALLOW', 'ALLOW'));
    await user.selectOptions(operator, 'LIKE');
    await user.selectOptions(effect, 'ALLOW');
    expect(operator).toHaveValue('EQUALS');
    expect(effect).toHaveValue('DENY');
    await user.type(within(form).getByRole('textbox', { name: 'Argument of condition 1' }), 'query');
    await user.type(within(form).getByRole('textbox', { name: 'Value of condition 1' }), '(a+)+');
    await user.click(within(form).getByRole('button', { name: 'Add the policy' }));
    expect(await within(card).findByText('unsafe pattern')).toBeInTheDocument();
  });

  it('removes a policy', async () => {
    const user = userEvent.setup();
    visit('/mcp');
    const card = await openAccess('linear');
    const list = within(card).getByRole('list', { name: 'Argument policies of linear' });
    const row = within(list).getAllByRole('listitem')[1];
    if (row === undefined) throw new Error('no second policy');
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    await user.click(within(row).getByRole('button', { name: 'Remove the policy on Every tool' }));
    await waitFor(() => {
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    });
    expect(db.mcpPolicies['linear']?.map((policy) => policy.id)).toEqual(['pol-1']);
  });
});

describe('another organization', () => {
  it('never shows the first one’s servers, people, policies, prefix or calls', async () => {
    const user = userEvent.setup();
    db.mcpPrefixes[ACME] = 'acme-ai';
    db.otherOrganizations = [otherOrganization()];
    visit('/mcp');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Globex' }));
    expect(
      await screen.findByText(
        'No MCP server yet: add one and every agent can use it, with its secrets kept on the server.',
      ),
    ).toBeInTheDocument();
    expect(await within(prefixSection()).findByText('mcp__ostrom-<server>__<tool>')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Recent calls' })).toBeNull();
    expect(screen.queryByText(/acme-ai/)).toBeNull();
  });
});
