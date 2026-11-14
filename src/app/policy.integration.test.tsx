// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

async function section(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

const refused = (message: string, status = 500) =>
  HttpResponse.json({ error: { type: status === 403 ? 'forbidden' : 'internal', message } }, { status });

describe('the agent policy', () => {
  it('shows which models the agents may use, the default, and who has a list of their own', async () => {
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText('claude-, gpt-5')).toBeInTheDocument();
    expect(within(models).getByText('claude-sonnet-4-5')).toBeInTheDocument();
    expect(await within(models).findByText('Only for theo')).toBeInTheDocument();
    expect(within(models).getByText('claude-haiku')).toBeInTheDocument();
  });

  it('changes the models, refusing what the gateway would refuse, and gives a member a list of their own', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    const allowed = within(models).getByRole('textbox', { name: 'Allowed models' });
    const fallback = within(models).getByRole('textbox', { name: 'Default model' });
    const save = within(models).getByRole('button', { name: 'Save' });
    await user.clear(fallback);
    expect(within(models).getByText('Name the model an agent gets when it names none.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(fallback, 'gemini-2.5-pro');
    expect(within(models).getByText('The default model is not in the allowed list.')).toBeInTheDocument();
    await user.type(allowed, ', gemini-');
    expect(save).toBeEnabled();
    // Theo's row is there; Lena gets one too.
    expect(within(models).getByRole('combobox', { name: 'Member 1' })).toHaveDisplayValue('theo');
    await user.click(within(models).getByRole('button', { name: 'Add a member' }));
    expect(within(models).getByText('Pick the member of each row.')).toBeInTheDocument();
    const second = within(models).getByRole('combobox', { name: 'Member 2' });
    // An invitation not accepted yet runs no agent.
    expect(within(second).queryByRole('option', { name: 'jo' })).toBeNull();
    await user.selectOptions(second, 'theo');
    expect(within(models).getByText('A member is listed twice.')).toBeInTheDocument();
    await user.selectOptions(second, 'lena');
    expect(
      within(models).getByText(
        'Each member’s list names at least one model: an empty one would allow every model.',
      ),
    ).toBeInTheDocument();
    await user.type(within(models).getByRole('textbox', { name: 'Models of member 2' }), 'gpt!5');
    expect(within(models).getByText('A model is letters, digits, and . - _ : / only.')).toBeInTheDocument();
    await user.clear(within(models).getByRole('textbox', { name: 'Models of member 2' }));
    await user.type(within(models).getByRole('textbox', { name: 'Models of member 2' }), 'gpt-5');
    await user.click(within(models).getByRole('button', { name: 'Remove member 1' }));
    await user.click(save);
    expect(await within(models).findByText('Models saved.')).toBeInTheDocument();
    expect(within(models).getByText('claude-, gpt-5, gemini-')).toBeInTheDocument();
    expect(within(models).getByText('Only for lena')).toBeInTheDocument();
    expect(within(models).queryByText('Only for theo')).toBeNull();
    expect(db.modelPolicies[db.organization.id]).toEqual({
      allowed: ['claude-', 'gpt-5', 'gemini-'],
      default: 'gemini-2.5-pro',
      byMember: { [MEMBER_IDS.lena]: ['gpt-5'] },
    });
  });

  it('cancels a change, and holds the form while it saves', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    await user.type(within(models).getByRole('textbox', { name: 'Allowed models' }), ', o3');
    await user.click(within(models).getByRole('button', { name: 'Cancel' }));
    expect(within(models).getByText('claude-, gpt-5')).toBeInTheDocument();
    server.use(http.put('*/api/v1/policy/models', async () => delay('infinite')));
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(within(models).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('says why a change was refused, and keeps the form', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/policy/models', () => refused('byMember is keyed by member id.', 400)));
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByRole('alert')).toHaveTextContent('byMember is keyed by member id.');
    expect(within(models).getByRole('textbox', { name: 'Allowed models' })).toBeInTheDocument();
  });

  it('names a member by id when the members cannot be read, and someone who left by their id', async () => {
    const user = userEvent.setup();
    db.modelPolicies[db.organization.id] = {
      allowed: [],
      default: 'claude-sonnet-4-5',
      byMember: { '9a9a9a9a-0000-4000-8000-000000000000': ['claude-haiku'] },
    };
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText('Every model')).toBeInTheDocument();
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    const gone = within(models).getByRole('combobox', { name: 'Member 1' });
    expect(gone).toHaveDisplayValue('9a9a9a9a-0000-4000-8000-000000000000');
    await user.click(within(models).getByRole('button', { name: 'Cancel' }));
  });

  it('takes a member id by hand when the members are not readable', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/orgs/:org/members', () => refused('no', 403)));
    db.modelPolicies[db.organization.id] = { allowed: [], default: '' };
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText('None')).toBeInTheDocument();
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Add a member' }));
    await user.type(within(models).getByRole('textbox', { name: 'Member 1' }), MEMBER_IDS.samir);
    expect(within(models).getByRole('textbox', { name: 'Member 1' })).toHaveValue(MEMBER_IDS.samir);
  });

  it('reads a new organization’s policy, which has no default yet, and sets the first one', async () => {
    const user = userEvent.setup();
    // The server leaves `default` out until one is set.
    server.use(http.get('*/api/v1/policy/models', () => HttpResponse.json({ allowed: [] }), { once: true }));
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText('None')).toBeInTheDocument();
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    expect(within(models).getByRole('textbox', { name: 'Default model' })).toHaveValue('');
    await user.type(within(models).getByRole('textbox', { name: 'Default model' }), 'claude-opus-4-1');
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByText('Models saved.')).toBeInTheDocument();
    expect(within(models).getByText('claude-opus-4-1')).toBeInTheDocument();
  });

  it('forgets a save or a refusal once the next edit opens or closes', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByText('Models saved.')).toBeInTheDocument();
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Cancel' }));
    expect(within(models).queryByText('Models saved.')).toBeNull();
    server.use(http.put('*/api/v1/policy/models', () => refused('policy down'), { once: true }));
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByRole('alert')).toHaveTextContent('policy down');
    await user.click(within(models).getByRole('button', { name: 'Cancel' }));
    expect(within(models).queryByRole('alert')).toBeNull();
  });

  it('says when a member’s own list refuses the default model', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    // Theo's list is claude-haiku; the default is claude-sonnet-4-5.
    expect(
      await within(models).findByText(
        'The own list of theo refuses the default model, claude-sonnet-4-5: their launches that name no model would be refused.',
      ),
    ).toBeInTheDocument();
    expect(within(models).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says why the policy does not come, and still asks a launch without a model', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/policy/models', () => refused('gateway down')));
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText(/gateway down/)).toBeInTheDocument();
    const check = await section('Would a launch pass?');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText(
        'You may launch claude. No default model is known: the model it names is checked as it starts.',
      ),
    ).toBeInTheDocument();
  });

  it('lets a member read the models, never change them nor see the keys', async () => {
    setDemoRole(db, 'member');
    visit('/policy');
    const models = await section('Models');
    expect(await within(models).findByText('Owners and admins change the models.')).toBeInTheDocument();
    expect(within(models).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(
      within(await section('Provider keys')).getByText(
        'Only owners and admins see which keys the organization uses.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the provider keys', () => {
  it('names each key by an organization secret, and saves them', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const keys = await section('Provider keys');
    const anthropic = await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    expect(anthropic).toHaveValue('ANTHROPIC_API_KEY');
    // Offered: the organization's secrets.
    expect(document.querySelector('datalist option[value="LINEAR_TOKEN"]')).not.toBeNull();
    await user.type(within(keys).getByRole('combobox', { name: 'OpenAI key' }), 'LINEAR_TOKEN');
    await user.clear(anthropic);
    await user.click(within(keys).getByRole('checkbox', { name: /shared subscriptions serve before/ }));
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    expect(await within(keys).findByText('Provider keys saved.')).toBeInTheDocument();
    expect(db.inferenceSettings[db.organization.id]).toEqual({
      openaiKeySecret: 'LINEAR_TOKEN',
      useSharedAccounts: false,
    });
  });

  it('keeps the members’ concurrent requests, which the settings carry too', async () => {
    const user = userEvent.setup();
    db.inferenceSettings[db.organization.id] = {
      anthropicKeySecret: 'ANTHROPIC_API_KEY',
      useSharedAccounts: true,
      memberConcurrency: { [MEMBER_IDS.samir]: 4 },
    };
    visit('/policy');
    const keys = await section('Provider keys');
    await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    expect(await within(keys).findByText('Provider keys saved.')).toBeInTheDocument();
    expect(db.inferenceSettings[db.organization.id]?.memberConcurrency).toEqual({ [MEMBER_IDS.samir]: 4 });
  });

  it('says when the organization has no secret yet, and why a save was refused', async () => {
    const user = userEvent.setup();
    db.secrets = [];
    server.use(http.put('*/api/v1/inference/settings', () => refused('A key is named by a secret', 400)));
    visit('/policy');
    const keys = await section('Provider keys');
    expect(
      await within(keys).findByText('The organization has no secret yet: add the key in Secrets first.'),
    ).toBeInTheDocument();
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    expect(await within(keys).findByRole('alert')).toHaveTextContent('A key is named by a secret');
  });

  it('forgets the save once a key is edited again', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const keys = await section('Provider keys');
    await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    expect(await within(keys).findByText('Provider keys saved.')).toBeInTheDocument();
    await user.type(within(keys).getByRole('combobox', { name: 'OpenAI key' }), 'X');
    expect(within(keys).queryByText('Provider keys saved.')).toBeNull();
  });

  it('keeps the answer of a save still going when a key is typed meanwhile', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(
        '*/api/v1/inference/settings',
        async () => {
          await answered;
          return refused('A key is named by a secret', 400);
        },
        { once: true },
      ),
    );
    visit('/policy');
    const keys = await section('Provider keys');
    await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    await user.type(within(keys).getByRole('combobox', { name: 'OpenAI key' }), 'X');
    release();
    expect(await within(keys).findByRole('alert')).toHaveTextContent('A key is named by a secret');
  });

  it('does not say saved when a key was typed while the save went', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(
        '*/api/v1/inference/settings',
        async ({ request }) => {
          await answered;
          return HttpResponse.json(await request.json());
        },
        { once: true },
      ),
    );
    visit('/policy');
    const keys = await section('Provider keys');
    await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    await user.type(within(keys).getByRole('combobox', { name: 'OpenAI key' }), 'X');
    release();
    await waitFor(() => {
      expect(within(keys).getByRole('button', { name: 'Save' })).toBeEnabled();
    });
    expect(within(keys).queryByText('Provider keys saved.')).toBeNull();
  });

  it('holds the keys while they save, and still names them when the secrets cannot be read', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/secrets', () => refused('no', 403)),
      http.put('*/api/v1/inference/settings', async () => delay('infinite')),
    );
    visit('/policy');
    const keys = await section('Provider keys');
    await within(keys).findByRole('combobox', { name: 'Anthropic key' });
    expect(within(keys).queryByText(/no secret yet/)).toBeNull();
    await user.click(within(keys).getByRole('button', { name: 'Save' }));
    expect(await within(keys).findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('the launch check', () => {
  it('asks whether a launch would pass, as the CLI does', async () => {
    const user = userEvent.setup();
    visit('/policy');
    const check = await section('Would a launch pass?');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText('You may launch claude with the default model, claude-sonnet-4-5.'),
    ).toBeInTheDocument();
    await user.type(within(check).getByRole('textbox', { name: 'Model' }), 'gemini-2.5-pro');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText('The organization does not allow gemini-2.5-pro.'),
    ).toBeInTheDocument();
    const agent = within(check).getByRole('combobox', { name: 'Agent' });
    await user.clear(agent);
    expect(within(check).getByRole('button', { name: 'Ask' })).toBeDisabled();
    await user.type(agent, 'codex');
    await user.clear(within(check).getByRole('textbox', { name: 'Model' }));
    await user.type(within(check).getByRole('textbox', { name: 'Model' }), 'gpt-5.1-codex');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(await within(check).findByText('You may launch codex with gpt-5.1-codex.')).toBeInTheDocument();
  });

  it('asks the server again for the same question, and says when there is no default model', async () => {
    const user = userEvent.setup();
    let asked = 0;
    server.use(
      http.get('*/api/v1/policy/agents', () => {
        asked += 1;
        return HttpResponse.json({ allowed: true });
      }),
    );
    db.modelPolicies[db.organization.id] = { allowed: [], default: '' };
    visit('/policy');
    const check = await section('Would a launch pass?');
    await within(await section('Models')).findByText('None');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText(
        'You may launch claude. No default model is known: the model it names is checked as it starts.',
      ),
    ).toBeInTheDocument();
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    await waitFor(() => {
      expect(asked).toBe(2);
    });
  });

  it('waits for the policy before asking, and asks again once the policy changes', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(
        '*/api/v1/policy/models',
        async () => {
          await loaded;
          return HttpResponse.json(db.modelPolicies[db.organization.id]);
        },
        { once: true },
      ),
    );
    visit('/policy');
    const check = await section('Would a launch pass?');
    // The default model is not known yet: an empty model cannot be asked for it.
    expect(within(check).getByRole('button', { name: 'Ask' })).toBeDisabled();
    release();
    await waitFor(() => {
      expect(within(check).getByRole('button', { name: 'Ask' })).toBeEnabled();
    });
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText('You may launch claude with the default model, claude-sonnet-4-5.'),
    ).toBeInTheDocument();
    const models = await section('Models');
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.clear(within(models).getByRole('textbox', { name: 'Default model' }));
    await user.type(within(models).getByRole('textbox', { name: 'Default model' }), 'claude-opus-4-1');
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(models).findByText('Models saved.')).toBeInTheDocument();
    // The question asked the default: asked again, it names the new one.
    expect(
      await within(check).findByText('You may launch claude with the default model, claude-opus-4-1.'),
    ).toBeInTheDocument();
    // A question that named its model is asked again as it was.
    await user.type(within(check).getByRole('textbox', { name: 'Model' }), 'gpt-5');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(await within(check).findByText('You may launch claude with gpt-5.')).toBeInTheDocument();
    await user.click(within(models).getByRole('button', { name: 'Change' }));
    await user.clear(within(models).getByRole('textbox', { name: 'Allowed models' }));
    await user.type(within(models).getByRole('textbox', { name: 'Allowed models' }), 'claude-');
    await user.click(within(models).getByRole('button', { name: 'Save' }));
    expect(await within(check).findByText('The organization does not allow gpt-5.')).toBeInTheDocument();
  });

  it('shows a refusal without a reason, a note, the wait, and a failure', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/policy/agents', () => HttpResponse.json({ allowed: false, note: 'Ask an owner.' }), {
        once: true,
      }),
      http.get('*/api/v1/policy/agents', () => refused('policy down'), { once: true }),
      http.get('*/api/v1/policy/agents', async () => delay('infinite')),
    );
    visit('/policy');
    const check = await section('Would a launch pass?');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(
      await within(check).findByText(/This launch would be refused\. Ask an owner\./),
    ).toBeInTheDocument();
    await user.type(within(check).getByRole('textbox', { name: 'Model' }), 'x');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(await within(check).findByRole('alert')).toHaveTextContent('policy down');
    await user.type(within(check).getByRole('textbox', { name: 'Model' }), 'y');
    await user.click(within(check).getByRole('button', { name: 'Ask' }));
    expect(await within(check).findByRole('button', { name: 'Asking…' })).toBeDisabled();
  });
});

describe('a team of more than a hundred people', () => {
  it('reads the next page of members to give a list of models to, when asked', async () => {
    const user = userEvent.setup();
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...largeMembers()];
    db.modelPolicies[db.organization.id] = { allowed: [], default: '' };
    visit('/policy');
    const models = await section('Models');
    await user.click(await within(models).findByRole('button', { name: 'Change' }));
    await user.click(within(models).getByRole('button', { name: 'Add a member' }));
    const pick = within(models).getByRole('combobox', { name: 'Member 1' });
    const before = within(pick).getAllByRole('option').length;
    await user.click(within(models).getByRole('button', { name: 'Show more people' }));
    await waitFor(() => {
      expect(within(pick).getAllByRole('option').length).toBeGreaterThan(before);
    });
  });
});
