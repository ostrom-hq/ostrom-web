// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const refuse = (message: string) => () =>
  HttpResponse.json({ error: { type: 'conflict', message } }, { status: 409 });

async function findCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  if (card === null) throw new Error(`no card ${name}`);
  return card;
}

describe('the artifacts', () => {
  it('lists each artifact with who reads it, opens only a web link, and lets only the owner delete', async () => {
    visit('/artifacts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Artifacts' })).toBeInTheDocument();
    const study = await findCard('Billing API: latency study');
    expect(within(study).getByRole('link', { name: 'Billing API: latency study' })).toHaveAttribute(
      'href',
      'https://app.ostrom.run/a/art-7',
    );
    expect(study).toHaveTextContent('Shared with people');
    expect(study).toHaveTextContent(/by maya · version 3 · updated /);
    expect(within(study).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    const checklist = await findCard('Release checklist');
    expect(checklist).toHaveTextContent('Whole organization');
    expect(within(checklist).queryByRole('button', { name: 'Delete' })).toBeNull();
    const draft = await findCard('Draft: pricing page');
    expect(within(draft).queryByRole('link')).toBeNull();
    expect(draft).toHaveTextContent('Only its owner');
  });

  it('shows an access it has no word for as is', async () => {
    db.artifacts = db.artifacts.map((item) => (item.id === 'art-5' ? { ...item, access: 'public' } : item));
    visit('/artifacts');
    expect(await findCard('Release checklist')).toHaveTextContent('public');
  });

  it('says when no artifact exists', async () => {
    db.artifacts = [];
    visit('/artifacts');
    expect(await screen.findByText('No artifact yet.')).toBeInTheDocument();
  });

  it('opens the versions and readers, shares with a member and stops sharing', async () => {
    const user = userEvent.setup();
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    const toggle = within(study).getByRole('button', { name: 'Versions and readers' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await within(study).findByText(/Version 3 · maya · /)).toBeInTheDocument();
    expect(study).toHaveTextContent('index.html, chart.svg, data.json');
    expect(within(study).queryByRole('button', { name: 'Stop sharing with maya' })).toBeNull();
    const reader = within(study).getByRole('combobox', { name: 'Add a reader' });
    expect(within(reader).getByRole('option', { name: 'Lena Ortiz (lena)' })).toBeInTheDocument();
    expect(within(reader).getByRole('option', { name: 'jo@acme.dev' })).toBeInTheDocument();
    expect(within(reader).queryByRole('option', { name: 'theo' })).toBeNull();
    expect(within(study).getByRole('button', { name: 'Share' })).toBeDisabled();
    await user.selectOptions(reader, 'samir');
    await user.click(within(study).getByRole('button', { name: 'Share' }));
    expect(await within(study).findByRole('button', { name: 'Stop sharing with samir' })).toBeInTheDocument();
    await user.click(within(study).getByRole('button', { name: 'Stop sharing with theo' }));
    await vi.waitFor(() => {
      expect(within(study).queryByRole('button', { name: 'Stop sharing with theo' })).toBeNull();
    });
    await user.click(within(study).getByRole('button', { name: 'Hide versions and readers' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('holds the buttons while a share is sent, and drops the form once everyone reads it', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/artifacts/:id/members/:login', async () => delay('infinite')));
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    const reader = await within(study).findByRole('combobox', { name: 'Add a reader' });
    await user.selectOptions(reader, 'lena');
    await user.click(within(study).getByRole('button', { name: 'Share' }));
    expect(within(study).getByRole('button', { name: 'Stop sharing with theo' })).toBeDisabled();
    expect(within(study).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('holds the buttons while a reader is removed, or the artifact deleted', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/artifacts/:id/members/:login', async () => delay('infinite')),
      http.delete('*/api/v1/artifacts/:id', async () => delay('infinite')),
    );
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    await user.click(await within(study).findByRole('button', { name: 'Stop sharing with theo' }));
    expect(within(study).getByRole('button', { name: 'Stop sharing with theo' })).toBeDisabled();
    const draft = await findCard('Draft: pricing page');
    await user.click(within(draft).getByRole('button', { name: 'Delete' }));
    await user.click(within(draft).getByRole('button', { name: 'Delete Draft: pricing page' }));
    expect(within(draft).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('has no form when every member already reads it, and says when nobody does', async () => {
    const user = userEvent.setup();
    db.artifactMembers['art-7'] = db.members.map((member) => member.login);
    db.artifacts = db.artifacts.map((item) => (item.id === 'art-2' ? { ...item, access: 'members' } : item));
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(study).findByRole('button', { name: 'Stop sharing with lena' })).toBeInTheDocument();
    expect(within(study).queryByRole('combobox')).toBeNull();
    const draft = await findCard('Draft: pricing page');
    await user.click(within(draft).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(draft).findByText('Nobody reads it yet.')).toBeInTheDocument();
    expect(draft).toHaveTextContent('No version yet.');
  });

  it('says who reads an artifact of the whole organization or of its owner alone, and reads only', async () => {
    const user = userEvent.setup();
    visit('/artifacts');
    const checklist = await findCard('Release checklist');
    await user.click(within(checklist).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(checklist).findByText('Everyone in the organization reads it.')).toBeInTheDocument();
    const draft = await findCard('Draft: pricing page');
    await user.click(within(draft).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(draft).findByText('Only maya reads it.')).toBeInTheDocument();
  });

  it('lists the readers of someone else’s artifact without buttons', async () => {
    const user = userEvent.setup();
    db.artifacts = db.artifacts.map((item) => (item.id === 'art-5' ? { ...item, access: 'members' } : item));
    db.artifactMembers['art-5'] = ['theo', 'samir'];
    visit('/artifacts');
    const checklist = await findCard('Release checklist');
    await user.click(within(checklist).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(checklist).findByText('samir')).toBeInTheDocument();
    expect(within(checklist).queryByRole('button', { name: /Stop sharing/ })).toBeNull();
    expect(within(checklist).queryByRole('combobox')).toBeNull();
  });

  it('opens someone else’s artifact even when the members cannot be read, versions newest first', async () => {
    const user = userEvent.setup();
    db.artifactVersions['art-5'] = [...(db.artifactVersions['art-7'] ?? [])].reverse();
    server.use(http.get('*/api/v1/members', refuse('members are private')));
    visit('/artifacts');
    const checklist = await findCard('Release checklist');
    await user.click(within(checklist).getByRole('button', { name: 'Versions and readers' }));
    const versions = await within(checklist).findAllByRole('listitem');
    expect(versions).toHaveLength(3);
    expect(versions[0]).toHaveTextContent(/^Version 3/);
    expect(versions[2]).toHaveTextContent(/^Version 1/);
    expect(within(checklist).queryByText('members are private')).toBeNull();
  });

  it('tells the owner why no reader can be added when the members cannot be read', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/members', refuse('members are private')));
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    expect(await within(study).findByText('members are private')).toBeInTheDocument();
    expect(within(study).queryByRole('combobox')).toBeNull();
  });

  it('keeps the picked reader when the share is refused', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/v1/artifacts/:id/members/:login', refuse('samir cannot read it')));
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    const reader = await within(study).findByRole('combobox', { name: 'Add a reader' });
    await user.selectOptions(reader, 'samir');
    await user.click(within(study).getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('samir cannot read it')).toBeInTheDocument();
    expect(reader).toHaveValue('samir');
  });

  it('says what failed while loading the detail', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/artifacts/:id/versions', async () => {
        await delay(50);
        return refuse('versions are gone')();
      }),
    );
    visit('/artifacts');
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Versions and readers' }));
    expect(within(study).getByText('Loading the versions and readers…')).toBeInTheDocument();
    expect(await within(study).findByText('versions are gone')).toBeInTheDocument();
  });

  it('deletes an artifact after a second click, and says when the server refuses', async () => {
    const user = userEvent.setup();
    visit('/artifacts');
    const draft = await findCard('Draft: pricing page');
    await user.click(within(draft).getByRole('button', { name: 'Delete' }));
    await user.click(within(draft).getByRole('button', { name: 'Delete Draft: pricing page' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Draft: pricing page' })).toBeNull();
    });
    server.use(http.delete('*/api/v1/artifacts/:id', refuse('it is still linked from a receipt')));
    const study = await findCard('Billing API: latency study');
    await user.click(within(study).getByRole('button', { name: 'Delete' }));
    await user.click(within(study).getByRole('button', { name: 'Delete Billing API: latency study' }));
    expect(await screen.findByText('it is still linked from a receipt')).toBeInTheDocument();
  });
});

describe('the shared subscriptions', () => {
  it('lists each subscription, whose it is, its daily share and who it is lent to', async () => {
    visit('/accounts');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Shared subscriptions' }),
    ).toBeInTheDocument();
    const max = await findCard('Maya’s Claude Max');
    expect(max).toHaveTextContent('Active');
    expect(max).toHaveTextContent('Anthropic · by maya · pool billing · $40.00 a day');
    expect(max).toHaveTextContent('Lent to theo, samir');
    expect(within(max).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    const pro = await findCard('Theo’s ChatGPT Pro');
    expect(pro).toHaveTextContent('Paused');
    expect(pro).toHaveTextContent('OpenAI · by theo · no daily limit');
    expect(pro).toHaveTextContent('Lent to maya');
    expect(within(pro).queryByRole('button')).toBeNull();
  });

  it('shows a status and a provider it has no word for as is, an expired sign-in, and nobody to lend to', async () => {
    db.sharedAccounts = [
      {
        id: 'a',
        provider: 'mistral',
        label: 'Odd',
        owner: 'theo',
        status: 'revoked',
        sharedWith: [],
        paused: false,
      },
      {
        id: 'b',
        provider: 'anthropic',
        label: 'Old',
        owner: 'theo',
        status: 'expired',
        sharedWith: [],
        paused: false,
      },
    ];
    visit('/accounts');
    const odd = await findCard('Odd');
    expect(odd).toHaveTextContent('revoked');
    expect(odd).toHaveTextContent('mistral · by theo');
    expect(odd).toHaveTextContent('Lent to nobody yet');
    expect(await findCard('Old')).toHaveTextContent('Sign-in expired');
  });

  it('says why the form to share a subscription is missing', async () => {
    server.use(http.get('*/api/v1/secrets', refuse('secrets are locked')));
    visit('/accounts');
    expect(await screen.findByText('secrets are locked')).toBeInTheDocument();
  });

  it('says when nothing is shared', async () => {
    db.sharedAccounts = [];
    visit('/accounts');
    expect(await screen.findByText('No shared subscription yet.')).toBeInTheDocument();
  });

  it('pauses and resumes a subscription, then stops sharing it after a second click', async () => {
    const user = userEvent.setup();
    visit('/accounts');
    const max = await findCard('Maya’s Claude Max');
    await user.click(within(max).getByRole('button', { name: 'Pause' }));
    expect(await within(max).findByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(max).toHaveTextContent('Paused');
    await user.click(within(max).getByRole('button', { name: 'Resume' }));
    expect(await within(max).findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.click(within(max).getByRole('button', { name: 'Stop sharing' }));
    await user.click(
      within(max).getByRole('button', { name: 'Stop sharing Maya’s Claude Max and delete its credential' }),
    );
    await vi.waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: 'Maya’s Claude Max' })).toBeNull();
    });
  });

  it('holds the buttons while a change is sent', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/accounts/:id', async () => delay('infinite')));
    visit('/accounts');
    const max = await findCard('Maya’s Claude Max');
    await user.click(within(max).getByRole('button', { name: 'Pause' }));
    expect(within(max).getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('holds the buttons while a subscription is removed', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/accounts/:id', async () => delay('infinite')));
    visit('/accounts');
    const max = await findCard('Maya’s Claude Max');
    await user.click(within(max).getByRole('button', { name: 'Stop sharing' }));
    await user.click(
      within(max).getByRole('button', { name: 'Stop sharing Maya’s Claude Max and delete its credential' }),
    );
    expect(within(max).getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('says when a removal is refused', async () => {
    const user = userEvent.setup();
    server.use(http.delete('*/api/v1/accounts/:id', refuse('a session still uses it')));
    visit('/accounts');
    const max = await findCard('Maya’s Claude Max');
    await user.click(within(max).getByRole('button', { name: 'Stop sharing' }));
    await user.click(
      within(max).getByRole('button', { name: 'Stop sharing Maya’s Claude Max and delete its credential' }),
    );
    expect(await screen.findByText('a session still uses it')).toBeInTheDocument();
  });

  it('shares a new subscription from a stored secret, lent to the people ticked, then clears the form', async () => {
    const user = userEvent.setup();
    visit('/accounts');
    const form = await screen.findByRole('region', { name: 'Share a subscription' });
    const submit = within(form).getByRole('button', { name: 'Share' });
    expect(submit).toBeDisabled();
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Provider' }), 'openai');
    fireEvent.change(within(form).getByRole('combobox', { name: 'Provider' }), { target: { value: 'bad' } });
    expect(within(form).getByRole('combobox', { name: 'Provider' })).toHaveValue('openai');
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), '  Team Pro ');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Credential' }), 'STRIPE_TEST_KEY');
    const daily = within(form).getByRole('textbox', { name: 'Daily share in USD (optional)' });
    await user.type(daily, 'abc');
    expect(
      within(form).getByText('A daily share is a positive amount, like 40 or 12.50.'),
    ).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.clear(daily);
    await user.type(daily, '12,50');
    await user.click(within(form).getByRole('checkbox', { name: 'theo' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Lena Ortiz (lena)' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Lena Ortiz (lena)' }));
    expect(within(form).queryByRole('checkbox', { name: /maya/ })).toBeNull();
    await user.click(submit);
    const lent = await findCard('Team Pro');
    expect(lent).toHaveTextContent('OpenAI · by maya · $12.50 a day');
    expect(lent).toHaveTextContent('Lent to theo');
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(form).getByRole('checkbox', { name: 'theo' })).not.toBeChecked();
  });

  it('says it while a new subscription is sent', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/accounts', async () => delay('infinite')));
    visit('/accounts');
    const form = await screen.findByRole('region', { name: 'Share a subscription' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Bare');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Credential' }), 'LINEAR_TOKEN');
    await user.click(within(form).getByRole('button', { name: 'Share' }));
    expect(within(form).getByRole('button', { name: 'Sharing…' })).toBeDisabled();
  });

  it('says when the server refuses a new subscription', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/accounts', refuse('this provider is off for the organization')));
    visit('/accounts');
    const form = await screen.findByRole('region', { name: 'Share a subscription' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Bare');
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Credential' }), 'LINEAR_TOKEN');
    await user.click(within(form).getByRole('button', { name: 'Share' }));
    expect(await screen.findByText('this provider is off for the organization')).toBeInTheDocument();
  });

  it('points to the secrets when there is none', async () => {
    db.secrets = [];
    visit('/accounts');
    const form = await screen.findByRole('region', { name: 'Share a subscription' });
    expect(within(form).getByRole('link', { name: 'Add it in Secrets' })).toHaveAttribute('href', '/secrets');
  });

  it('has nobody to lend to in an organization of one', async () => {
    db.members = db.members.filter((member) => member.login === 'maya');
    visit('/accounts');
    const form = await screen.findByRole('region', { name: 'Share a subscription' });
    expect(within(form).queryByRole('group')).toBeNull();
  });
});
