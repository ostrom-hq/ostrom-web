// SPDX-License-Identifier: AGPL-3.0-only
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { LEFT_MEMBER } from '@/mocks/fixtures/sharing';
import { groupId } from '@/mocks/groups';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const refuse = (message: string) => () =>
  HttpResponse.json({ error: { type: 'conflict', message } }, { status: 409 });

const PLATFORM = `/accounts/groups/${groupId(1)}`;

async function findCard(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 3, name });
  const card = heading.closest('article');
  if (card === null) throw new Error(`no card ${name}`);
  return card;
}

/** The member's row, if they are in the group. */
function rowOf(members: HTMLElement, name: string): HTMLElement | undefined {
  return within(members)
    .queryAllByRole('listitem')
    .find((item) => within(item).queryByText(name, { exact: true }) !== null);
}

async function findRow(name: string): Promise<HTMLElement> {
  const row = rowOf(await screen.findByRole('region', { name: 'Members' }), name);
  if (row === undefined) throw new Error(`no member ${name}`);
  return row;
}

describe('the list of groups', () => {
  it('sits beside the subscriptions, and lists each group with its people, what it lends and who is paused', async () => {
    const user = userEvent.setup();
    visit('/accounts');
    const tabs = await screen.findByRole('navigation', { name: 'Shared accounts' });
    expect(within(tabs).getByRole('link', { name: 'Subscriptions' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(tabs).getByRole('link', { name: 'Groups' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    const shown = screen.getByRole('navigation', { name: 'Shared accounts' });
    expect(within(shown).getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
    const platform = await findCard('Platform');
    expect(within(platform).getByRole('link', { name: 'Platform' })).toHaveAttribute('href', PLATFORM);
    expect(platform).toHaveTextContent('1 paused');
    expect(platform).toHaveTextContent('3 members');
    expect(platform).toHaveTextContent('Lends Maya’s Claude Max');
    const billing = await findCard('Billing');
    expect(billing).toHaveTextContent('2 members');
    expect(billing).toHaveTextContent('Lends no subscription');
    expect(billing).not.toHaveTextContent('paused');
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Billing',
      'Platform',
    ]);
  });

  it('says when there is no group, and offers no form to a member', async () => {
    db.groups = [];
    setDemoRole(db, 'member');
    visit('/accounts/groups');
    expect(await screen.findByText('No group. A group lends subscriptions to a team.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'New group' })).toBeNull();
  });

  it('says when a group asked for no longer exists', async () => {
    visit('/accounts/groups?gone=1');
    expect(await screen.findByText('This group no longer exists.')).toBeInTheDocument();
  });

  it('reads a group the server gives without its pauses as one with nobody paused', async () => {
    const bare = { id: groupId(7), name: 'Bare', members: ['theo'], accounts: [] };
    server.use(http.get('*/api/v1/groups', () => HttpResponse.json({ items: [bare] })));
    visit('/accounts/groups');
    expect(await findCard('Bare')).not.toHaveTextContent('paused');
  });

  it('says why the groups cannot be read', async () => {
    server.use(http.get('*/api/v1/groups', refuse('groups are down')));
    visit('/accounts/groups');
    expect(await screen.findByText('groups are down')).toBeInTheDocument();
  });

  it('still lists the groups when the subscriptions cannot be read, counting what they lend', async () => {
    server.use(http.get('*/api/v1/accounts', refuse('subscriptions are locked')));
    visit('/accounts/groups');
    expect(await screen.findByText('subscriptions are locked')).toBeInTheDocument();
    expect(await findCard('Platform')).toHaveTextContent('Lends 1 subscription you cannot see');
    const form = screen.getByRole('region', { name: 'New group' });
    expect(within(form).queryByRole('group', { name: 'Subscriptions it lends' })).toBeNull();
  });

  it('creates a group with the people and subscriptions ticked, then clears the form', async () => {
    const user = userEvent.setup();
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    const submit = within(form).getByRole('button', { name: 'Create the group' });
    expect(submit).toBeDisabled();
    const name = within(form).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('maxlength', '120');
    await user.type(name, '  Ops ');
    await user.click(within(form).getByRole('checkbox', { name: 'theo' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Lena Ortiz (lena)' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Lena Ortiz (lena)' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Theo’s ChatGPT Pro' }));
    await user.click(submit);
    const ops = await findCard('Ops');
    expect(ops).toHaveTextContent('1 member');
    expect(ops).toHaveTextContent('Lends Theo’s ChatGPT Pro');
    expect(name).toHaveValue('');
    expect(within(form).getByRole('checkbox', { name: 'theo' })).not.toBeChecked();
    expect(within(form).getByRole('checkbox', { name: 'Theo’s ChatGPT Pro' })).not.toBeChecked();
  });

  it('says it while a group is created, and what the server refuses', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/groups', async () => delay('infinite')));
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Ops');
    await user.click(within(form).getByRole('button', { name: 'Create the group' }));
    expect(within(form).getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });

  it('shows the server’s words when it refuses a name already taken', async () => {
    const user = userEvent.setup();
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'platform');
    await user.click(within(form).getByRole('button', { name: 'Create the group' }));
    expect(await screen.findByText('Another group already has this name.')).toBeInTheDocument();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('platform');
  });

  it('has nobody to tick when the members come back empty', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', () => HttpResponse.json({ items: [] })));
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    expect(within(form).queryByRole('group', { name: 'Members' })).toBeNull();
  });
});

describe('a group', () => {
  it('shows its members, who left, who is paused until when, and what it lends', async () => {
    visit(PLATFORM);
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform' })).toBeInTheDocument();
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All groups' })).toHaveAttribute('href', '/accounts/groups');
    const theo = await findRow('theo');
    const pause = within(theo).getByRole('button', { name: 'Pause theo' });
    expect(pause).toHaveAttribute('aria-expanded', 'false');
    const samir = await findRow('samir');
    expect(samir).toHaveTextContent(/Paused until \w+ \d+, 20\d\d/);
    expect(within(samir).getByRole('button', { name: 'Resume samir' })).toBeInTheDocument();
    const left = await findRow(LEFT_MEMBER);
    expect(await within(left).findByText('Left the organization')).toBeInTheDocument();
    expect(within(left).queryByRole('button', { name: /Pause/ })).toBeNull();
    expect(within(left).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    const lending = screen.getByRole('region', { name: 'Subscriptions it lends' });
    expect(await within(lending).findByRole('checkbox', { name: 'Maya’s Claude Max' })).toBeChecked();
    expect(within(lending).getByRole('checkbox', { name: 'Theo’s ChatGPT Pro' })).not.toBeChecked();
    expect(within(lending).getByRole('button', { name: 'Save the subscriptions' })).toBeDisabled();
  });

  it('pauses a member for a day, another until a day picked, and resumes one', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const theo = await findRow('theo');
    const toggle = within(theo).getByRole('button', { name: 'Pause theo' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(within(theo).getByRole('button', { name: 'Cancel' }));
    expect(within(theo).queryByRole('group')).toBeNull();
    await user.click(toggle);
    const choices = within(theo).getByRole('group', { name: 'How long to pause theo' });
    await user.click(within(choices).getByRole('button', { name: 'For a day' }));
    expect(await within(theo).findByText(/^Paused until /)).toBeInTheDocument();
    expect(within(theo).queryByRole('group')).toBeNull();

    const samir = await findRow('samir');
    await user.click(within(samir).getByRole('button', { name: 'Resume samir' }));
    await vi.waitFor(() => {
      expect(samir).not.toHaveTextContent('Paused until');
    });
    await user.click(within(samir).getByRole('button', { name: 'Pause samir' }));
    const until = within(samir).getByRole('group', { name: 'How long to pause samir' });
    const onDay = within(until).getByRole('button', { name: 'Pause until that day' });
    expect(onDay).toBeDisabled();
    fireEvent.change(within(until).getByLabelText('Until'), { target: { value: '2099-05-01' } });
    await user.click(within(until).getByRole('button', { name: 'Pause until that day' }));
    expect(await within(samir).findByText(/^Paused until May 2, 2099/)).toBeInTheDocument();
  });

  it('puts the focus on the first choice when they open, and back on the button when they close', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const theo = await findRow('theo');
    const toggle = within(theo).getByRole('button', { name: 'Pause theo' });
    await user.click(toggle);
    expect(within(theo).getByRole('button', { name: 'For a day' })).toHaveFocus();
    await user.click(within(theo).getByRole('button', { name: 'Cancel' }));
    expect(toggle).toHaveFocus();
  });

  it('sends no day already over when the page stayed open past midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2099-05-01T23:59:00Z'));
      const user = userEvent.setup();
      visit(PLATFORM);
      const theo = await findRow('theo');
      await user.click(within(theo).getByRole('button', { name: 'Pause theo' }));
      const day = within(theo).getByLabelText('Until');
      fireEvent.change(day, { target: { value: '2099-05-01' } });
      vi.setSystemTime(new Date('2099-05-02T00:01:00Z'));
      await user.click(within(theo).getByRole('button', { name: 'Pause until that day' }));
      expect(day).toHaveValue('');
      expect(within(theo).getByRole('button', { name: 'Pause until that day' })).toBeDisabled();
      expect(theo).not.toHaveTextContent('Paused until');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses a member for a week', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const theo = await findRow('theo');
    await user.click(within(theo).getByRole('button', { name: 'Pause theo' }));
    await user.click(within(theo).getByRole('button', { name: 'For a week' }));
    expect(await within(theo).findByText(/^Paused until /)).toBeInTheDocument();
  });

  it('holds the buttons while a change is sent', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/groups/:id/members/:login/pause', async () => delay('infinite')));
    visit(PLATFORM);
    const samir = await findRow('samir');
    await user.click(within(samir).getByRole('button', { name: 'Resume samir' }));
    expect(within(samir).getByRole('button', { name: 'Resume samir' })).toBeDisabled();
    expect(within(await findRow('theo')).getByRole('button', { name: 'Pause theo' })).toBeDisabled();
  });

  it('adds a member, then removes one after a second click', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const members = await screen.findByRole('region', { name: 'Members' });
    // The organization's members may come after the group: the form waits for them.
    const pick = await within(members).findByRole('combobox', { name: 'Add a member' });
    expect(within(pick).queryByRole('option', { name: 'theo' })).toBeNull();
    const add = within(members).getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();
    await user.selectOptions(pick, 'Lena Ortiz (lena)');
    await user.click(add);
    expect(await findRow('lena')).toBeInTheDocument();
    expect(pick).toHaveValue('');
    expect(within(pick).queryByRole('option', { name: 'Lena Ortiz (lena)' })).toBeNull();

    const theo = await findRow('theo');
    await user.click(within(theo).getByRole('button', { name: 'Remove' }));
    await user.click(within(theo).getByRole('button', { name: 'Remove theo from the group' }));
    await vi.waitFor(() => {
      expect(rowOf(members, 'theo')).toBeUndefined();
    });
  });

  it('has no one to add once everyone is in, and says when nobody is', async () => {
    const platform = db.groups.find((group) => group.id === groupId(1));
    if (platform !== undefined) platform.members = ['lena', 'maya', 'samir', 'theo', 'ines'];
    const billing = db.groups.find((group) => group.id === groupId(2));
    if (billing !== undefined) billing.members = [];
    visit(PLATFORM);
    const members = await screen.findByRole('region', { name: 'Members' });
    await within(members).findByText('ines', { exact: true });
    expect(within(members).queryByRole('combobox')).toBeNull();
    cleanup();
    visit(`/accounts/groups/${groupId(2)}`);
    expect(await screen.findByText('Nobody is in this group yet.')).toBeInTheDocument();
  });

  it('names who is in it as is when the members cannot be read', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', refuse('members are locked')));
    visit(PLATFORM);
    expect(await screen.findByText('members are locked')).toBeInTheDocument();
    const left = await findRow(LEFT_MEMBER);
    expect(left).not.toHaveTextContent('Left the organization');
    expect(screen.queryByRole('combobox', { name: 'Add a member' })).toBeNull();
  });

  it('changes the subscriptions it lends', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const lending = await screen.findByRole('region', { name: 'Subscriptions it lends' });
    await user.click(await within(lending).findByRole('checkbox', { name: 'Theo’s ChatGPT Pro' }));
    await user.click(within(lending).getByRole('button', { name: 'Save the subscriptions' }));
    await vi.waitFor(() => {
      expect(db.groups.find((group) => group.id === groupId(1))?.accounts).toEqual(['acc-1', 'acc-2']);
    });
    expect(await within(lending).findByRole('checkbox', { name: 'Theo’s ChatGPT Pro' })).toBeChecked();
    expect(within(lending).getByRole('button', { name: 'Save the subscriptions' })).toBeDisabled();
  });

  it('lists what it lends to a member, read only', async () => {
    setDemoRole(db, 'member');
    visit(PLATFORM);
    const lending = await screen.findByRole('region', { name: 'Subscriptions it lends' });
    expect(await within(lending).findByText('Maya’s Claude Max')).toBeInTheDocument();
    expect(within(lending).queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Only an owner or an admin changes a group.')).toBeInTheDocument();
    expect(within(await findRow('theo')).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Group' })).toBeNull();
    cleanup();
    visit(`/accounts/groups/${groupId(2)}`);
    expect(await screen.findByText('It lends no subscription.')).toBeInTheDocument();
  });

  it('counts the subscriptions it lends that the person cannot read, never naming them', async () => {
    db.sharedAccounts = db.sharedAccounts.filter((account) => account.id !== 'acc-1');
    setDemoRole(db, 'member');
    visit('/accounts/groups');
    expect(await findCard('Platform')).toHaveTextContent('Lends 1 subscription you cannot see');
    cleanup();
    visit(PLATFORM);
    expect(await screen.findByText('It lends 1 subscription you cannot see.')).toBeInTheDocument();
  });

  it('says it lends nothing when no subscription is shared', async () => {
    db.sharedAccounts = [];
    visit(`/accounts/groups/${groupId(2)}`);
    expect(await screen.findByText('It lends no subscription.')).toBeInTheDocument();
  });

  it('says nothing of what it lends when the subscriptions cannot be read', async () => {
    server.use(http.get('*/api/v1/accounts', refuse('subscriptions are locked')));
    visit(PLATFORM);
    expect(await screen.findByText('subscriptions are locked')).toBeInTheDocument();
    const lending = screen.getByRole('region', { name: 'Subscriptions it lends' });
    expect(within(lending).queryByRole('listitem')).toBeNull();
    expect(within(lending).queryByRole('checkbox')).toBeNull();
  });

  it('renames the group, and shows the server’s words when the name is taken', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const settings = await screen.findByRole('region', { name: 'Group' });
    const name = within(settings).getByRole('textbox', { name: 'Name' });
    const rename = within(settings).getByRole('button', { name: 'Rename' });
    expect(rename).toBeDisabled();
    await user.clear(name);
    expect(rename).toBeDisabled();
    await user.type(name, ' Core ');
    await user.click(rename);
    expect(await screen.findByRole('heading', { level: 1, name: 'Core' })).toBeInTheDocument();
    // The settings start again from the new name.
    const renamed = screen.getByRole('region', { name: 'Group' });
    const field = within(renamed).getByRole('textbox', { name: 'Name' });
    expect(field).toHaveValue('Core');
    await user.clear(field);
    await user.type(field, 'billing');
    await user.click(within(renamed).getByRole('button', { name: 'Rename' }));
    expect(await screen.findByText('Another group already has this name.')).toBeInTheDocument();
  });

  it('deletes the group after a second click, back to the list', async () => {
    const user = userEvent.setup();
    visit(PLATFORM);
    const settings = await screen.findByRole('region', { name: 'Group' });
    await user.click(within(settings).getByRole('button', { name: 'Delete the group' }));
    await user.click(
      within(settings).getByRole('button', {
        name: 'Delete Platform: its subscriptions stay, no longer lent by it',
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    expect(await findCard('Billing')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Platform' })).toBeNull();
    expect(screen.queryByText('This group no longer exists.')).toBeNull();
  });

  it('goes back to the list when the group is not there, and says so', async () => {
    visit(`/accounts/groups/${groupId(99)}`);
    expect(await screen.findByText('This group no longer exists.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
  });

  it('says why a group cannot be read', async () => {
    server.use(http.get('*/api/v1/groups/:id', refuse('groups are down')));
    visit(PLATFORM);
    expect(await screen.findByText('groups are down')).toBeInTheDocument();
  });
});

describe('a new group in a large organization', () => {
  beforeEach(() => {
    const org = db.organization.id;
    db.orgMembers[org] = [...(db.orgMembers[org] ?? []), ...largeMembers()];
  });

  /** "Show more people", once the page before it is read. */
  async function morePeople(): Promise<void> {
    const button = await screen.findByRole('button', { name: 'Show more people' });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
    await userEvent.click(button);
  }

  it('offers twenty people at a time, finds them by name or login, and reads the next hundred when asked', async () => {
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    const people = within(form).getByRole('group', { name: 'Members' });
    expect(within(people).getAllByRole('checkbox')).toHaveLength(20);
    expect(within(people).queryByRole('button', { name: 'Show more people' })).toBeNull();
    await userEvent.click(within(people).getByRole('button', { name: /^Show 20 more/ }));
    expect(within(people).getAllByRole('checkbox')).toHaveLength(40);
    const search = within(people).getByRole('searchbox', { name: 'Find someone' });
    await userEvent.type(search, 'dev-04');
    expect(
      within(people)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(Array.from({ length: 10 }, (_, n) => `Developer 04${String(n)} (dev-04${String(n)})`));
    await userEvent.clear(search);
    await userEvent.type(search, 'dev-42');
    expect(within(people).queryAllByRole('checkbox')).toHaveLength(0);
    for (let page = 2; page <= 5; page += 1) await morePeople();
    await waitFor(() => {
      expect(within(people).getAllByRole('checkbox')).toHaveLength(10);
    });
  });

  it('searches on Enter, never creating the group', async () => {
    const groups = db.groups.length;
    visit('/accounts/groups');
    const form = await screen.findByRole('region', { name: 'New group' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Platform');
    await userEvent.type(within(form).getByRole('searchbox', { name: 'Find someone' }), 'dev-04{Enter}');
    expect(within(form).getAllByRole('checkbox', { checked: false }).length).toBeGreaterThanOrEqual(10);
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Platform');
    expect(db.groups).toHaveLength(groups);
  });

  it('says a member left only once every page of members is read', async () => {
    db.groups = db.groups.map((group) =>
      group.id === groupId(1) ? { ...group, members: [...group.members, 'dev-450'] } : group,
    );
    visit(PLATFORM);
    const late = await findRow('dev-450');
    expect(within(await findRow(LEFT_MEMBER)).queryByText('Left the organization')).toBeNull();
    for (let page = 2; page <= 6; page += 1) await morePeople();
    expect(await within(await findRow(LEFT_MEMBER)).findByText('Left the organization')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more people' })).toBeNull();
    expect(within(late).queryByText('Left the organization')).toBeNull();
  });
});
