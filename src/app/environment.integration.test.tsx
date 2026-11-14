// SPDX-License-Identifier: Apache-2.0
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { largeMembers } from '@/mocks/fixtures/large';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

async function region(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

/** A team variant's row, by its variable and name. */
async function variantRow(variable: string, name: string): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Team variants' });
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(variable) !== null && within(item).queryByText(name) !== null);
  if (row === undefined) throw new Error(`no variant ${variable}: ${name}`);
  return row;
}

async function memberRow(label: string): Promise<HTMLElement> {
  const list = await screen.findByRole('list', { name: 'Effective assignments' });
  return within(list).getByRole('listitem', { name: label });
}

describe('the environment variants page', { timeout: 15_000 }, () => {
  it('lists the team variants with their binding, version and value state, never a value', async () => {
    visit('/environment');
    expect(await screen.findByText('What is a variant?')).toBeInTheDocument();
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    expect(screen.getByRole('heading', { level: 1, name: 'Environment variables' })).toBeInTheDocument();
    expect(acme).toHaveTextContent('shared');
    expect(acme).toHaveTextContent('v2 · shared value stored');
    const own = await variantRow('GITHUB_TOKEN', 'own account');
    expect(own).toHaveTextContent('v1 · value set per member');
    // A per-member variant is never assigned in bulk.
    expect(within(own).queryByRole('button', { name: 'Assign to all members' })).toBeNull();
    expect(within(acme).getByRole('button', { name: 'Assign to all members' })).toBeInTheDocument();
  });

  it('shows what each member receives and what they are excluded from', async () => {
    visit('/environment');
    const theo = await memberRow('theo');
    expect(theo).toHaveTextContent('GITHUB_TOKEN → acme v2 · bulk');
    expect(theo).toHaveTextContent('OPENROUTER_API_KEY → mine v1 · direct · their own');
    const lena = await memberRow('Lena Ortiz (lena)');
    expect(lena).toHaveTextContent('own account v1 · direct · member value stored');
    const samir = await memberRow('Samir Haddad (samir)');
    expect(samir).toHaveTextContent('Nothing assigned');
    expect(samir).toHaveTextContent('SENTRY_DSN excluded');
    // An invitation not accepted yet has nothing to receive.
    expect(screen.queryByRole('listitem', { name: 'jo' })).toBeNull();
  });

  it('lists the members’ personal variants for review, and says which one stays unassigned', async () => {
    visit('/environment');
    const review = await screen.findByRole('list', { name: 'Members’ personal variants' });
    const [mine, sentry] = within(review).getAllByRole('listitem');
    expect(mine).toHaveTextContent('OPENROUTER_API_KEY');
    expect(mine).toHaveTextContent('by theo · v1 · shared value stored');
    expect(mine).not.toHaveTextContent('Not assigned');
    expect(sentry).toHaveTextContent('by Samir Haddad (samir)');
    expect(sentry).toHaveTextContent(
      'Not assigned: an administrator’s assignment or an exclusion took this variable.',
    );
  });

  it('creates a shared variant, sends its value once and forgets it', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Create a variant');
    await user.type(within(form).getByLabelText('Variable name'), 'SENTRY_TOKEN');
    await user.type(within(form).getByLabelText('Variant name'), 'ci');
    await user.type(within(form).getByLabelText('Value'), 'sntrys_secret_value');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    const row = await variantRow('SENTRY_TOKEN', 'ci');
    expect(row).toHaveTextContent('v1 · shared value stored');
    expect(within(form).getByLabelText('Variable name')).toHaveValue('');
    expect(within(form).getByLabelText('Value')).toHaveValue('');
    expect(document.body).not.toHaveTextContent('sntrys_secret_value');
    expect(db.environmentVariants.find((variant) => variant.variable === 'SENTRY_TOKEN')?.binding).toBe(
      'shared',
    );
  });

  it('creates a per-member variant without a value field', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Create a variant');
    await user.type(within(form).getByLabelText('Variable name'), 'LINEAR_KEY');
    await user.type(within(form).getByLabelText('Variant name'), 'own');
    await user.type(within(form).getByLabelText('Value'), 'typed-before');
    await user.click(within(form).getByLabelText('Each member has their own'));
    expect(within(form).queryByLabelText('Value')).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    expect(await variantRow('LINEAR_KEY', 'own')).toHaveTextContent('value set per member');
    expect(db.environmentVariants.find((variant) => variant.variable === 'LINEAR_KEY')?.hasValue).toBe(false);
    expect(within(form).getByLabelText('One value for everyone assigned')).toBeChecked();
  });

  it('says what stops a variant from being created', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Create a variant');
    await user.type(within(form).getByLabelText('Variable name'), 'lower');
    expect(within(form).getByRole('alert')).toHaveTextContent('Use uppercase letters');
    await user.clear(within(form).getByLabelText('Variable name'));
    expect(within(form).queryByRole('alert')).toBeNull();
    await user.type(within(form).getByLabelText('Variable name'), 'API_KEY');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Give the variant a name');
    await user.type(within(form).getByLabelText('Variant name'), 'ci');
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Enter the value everyone assigned will receive.',
    );
    expect(db.environmentVariants.some((variant) => variant.variable === 'API_KEY')).toBe(false);
  });

  it('says why the server refused a variant', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Create a variant');
    await user.type(within(form).getByLabelText('Variable name'), 'PATH');
    await user.type(within(form).getByLabelText('Variant name'), 'mine');
    await user.type(within(form).getByLabelText('Value'), '/usr/bin');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    expect(await screen.findByText('PATH is reserved.')).toBeInTheDocument();
    // The form keeps what was typed, to correct it.
    expect(within(form).getByLabelText('Variable name')).toHaveValue('PATH');
  });

  it('renames a variant and replaces its shared value against the version read', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    await user.click(within(acme).getByRole('button', { name: 'Edit GITHUB_TOKEN: acme' }));
    const edit = within(acme).getByRole('form', { name: 'Edit GITHUB_TOKEN: acme' });
    const save = within(edit).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.type(within(edit).getByLabelText('New value (optional)'), 'ghp_rotated');
    await user.click(save);
    const after = await variantRow('GITHUB_TOKEN', 'acme');
    await within(after).findByText(/v3/);
    expect(document.body).not.toHaveTextContent('ghp_rotated');
    await user.click(within(after).getByRole('button', { name: 'Edit GITHUB_TOKEN: acme' }));
    const again = within(after).getByRole('form', { name: 'Edit GITHUB_TOKEN: acme' });
    await user.clear(within(again).getByLabelText('Variant name'));
    expect(within(again).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(within(again).getByLabelText('Variant name'), 'acme-org');
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    expect(await variantRow('GITHUB_TOKEN', 'acme-org')).toHaveTextContent('v4');
    // Every assignee's row follows the variant.
    expect(await memberRow('theo')).toHaveTextContent('GITHUB_TOKEN → acme-org v4');
  });

  it('edits a per-member variant’s name only, and cancels an edit', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const own = await variantRow('GITHUB_TOKEN', 'own account');
    await user.click(within(own).getByRole('button', { name: 'Edit GITHUB_TOKEN: own account' }));
    expect(within(own).queryByLabelText('New value (optional)')).toBeNull();
    await user.type(within(own).getByLabelText('Variant name'), ' typed');
    await user.click(within(own).getByRole('button', { name: 'Cancel' }));
    expect(within(own).queryByRole('form')).toBeNull();
    await user.click(within(own).getByRole('button', { name: 'Edit GITHUB_TOKEN: own account' }));
    expect(within(own).getByLabelText('Variant name')).toHaveValue('own account');
  });

  it('says when another administrator changed the variant first', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    await user.click(within(acme).getByRole('button', { name: 'Edit GITHUB_TOKEN: acme' }));
    db.environmentVariants = db.environmentVariants.map((variant) =>
      variant.id === 'env-1' ? { ...variant, version: 9 } : variant,
    );
    await user.type(within(acme).getByLabelText('New value (optional)'), 'ghp_late');
    await user.click(within(acme).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This variant changed since you read it');
  });

  it('assigns a shared variant to every current member and says what it did', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const npm = await variantRow('NPM_TOKEN', 'registry');
    await user.click(within(npm).getByRole('button', { name: 'Assign to all members' }));
    await user.click(
      within(npm).getByRole('button', { name: 'Assign NPM_TOKEN: registry to every current member' }),
    );
    expect(await within(await variantRow('NPM_TOKEN', 'registry')).findByRole('status')).toHaveTextContent(
      'Assigned to 5 members. 0 kept their direct selection, 0 excluded were skipped.',
    );
    expect(await memberRow('theo')).toHaveTextContent('NPM_TOKEN → registry v1 · bulk');
    // The next gesture clears it.
    await user.click(
      within(await memberRow('theo')).getByRole('button', { name: 'Remove NPM_TOKEN from theo' }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('keeps direct selections and skips excluded members in a bulk assignment', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    await user.click(within(acme).getByRole('button', { name: 'Assign to all members' }));
    await user.click(
      within(acme).getByRole('button', { name: 'Assign GITHUB_TOKEN: acme to every current member' }),
    );
    expect(await within(await variantRow('GITHUB_TOKEN', 'acme')).findByRole('status')).toHaveTextContent(
      'Assigned to 3 members. 2 kept their direct selection, 0 excluded were skipped.',
    );
  });

  it('deletes a variant and its assignments', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    await user.click(within(acme).getByRole('button', { name: 'Delete' }));
    await user.click(within(acme).getByRole('button', { name: 'Delete GITHUB_TOKEN: acme' }));
    await waitFor(() => {
      expect(screen.queryByText('acme')).toBeNull();
    });
    expect(await memberRow('Maya Lind (maya)')).toHaveTextContent('Nothing assigned');
  });

  it('assigns a per-member variant with the member’s own value, written once', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Assign a variant');
    await user.selectOptions(within(form).getByLabelText('Member'), 'theo');
    expect(within(form).queryByLabelText('Member value')).toBeNull();
    await user.selectOptions(
      within(form).getByLabelText('Variant'),
      'GITHUB_TOKEN: own account (per member)',
    );
    await user.click(within(form).getByRole('button', { name: 'Assign' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'A per-member variant needs this member’s value.',
    );
    await user.type(within(form).getByLabelText('Member value'), 'ghp_theo_own');
    // A value typed for one variant never follows to another.
    await user.selectOptions(within(form).getByLabelText('Variant'), 'NPM_TOKEN: registry (shared)');
    await user.selectOptions(
      within(form).getByLabelText('Variant'),
      'GITHUB_TOKEN: own account (per member)',
    );
    expect(within(form).getByLabelText('Member value')).toHaveValue('');
    await user.type(within(form).getByLabelText('Member value'), 'ghp_theo_own');
    await user.click(within(form).getByRole('button', { name: 'Assign' }));
    expect(await memberRow('theo')).toHaveTextContent(
      'GITHUB_TOKEN → own account v1 · direct · member value stored',
    );
    expect(within(form).getByLabelText('Member value')).toHaveValue('');
    expect(document.body).not.toHaveTextContent('ghp_theo_own');
  });

  it('assigns a shared variant without a value, and refuses an excluded member', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Assign a variant');
    await user.selectOptions(within(form).getByLabelText('Member'), 'Samir Haddad (samir)');
    await user.selectOptions(within(form).getByLabelText('Variant'), 'NPM_TOKEN: registry (shared)');
    await user.click(within(form).getByRole('button', { name: 'Assign' }));
    expect(await memberRow('Samir Haddad (samir)')).toHaveTextContent('NPM_TOKEN → registry v1 · direct');
    db.environmentExclusions = [
      ...db.environmentExclusions,
      { member: MEMBER_IDS.samir, variable: 'GITHUB_TOKEN' },
    ];
    await user.selectOptions(within(form).getByLabelText('Variant'), 'GITHUB_TOKEN: acme (shared)');
    await user.click(within(form).getByRole('button', { name: 'Assign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This member is excluded from this variable.');
  });

  it('falls back to the first variant when the chosen one is deleted', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Assign a variant');
    await user.selectOptions(within(form).getByLabelText('Variant'), 'NPM_TOKEN: registry (shared)');
    const npm = await variantRow('NPM_TOKEN', 'registry');
    await user.click(within(npm).getByRole('button', { name: 'Delete' }));
    await user.click(within(npm).getByRole('button', { name: 'Delete NPM_TOKEN: registry' }));
    await waitFor(() => {
      expect(within(form).getByLabelText('Variant')).toHaveDisplayValue('GITHUB_TOKEN: acme (shared)');
    });
  });

  it('removes a member’s selection: nothing falls back to a bulk value', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const maya = await memberRow('Maya Lind (maya)');
    await user.click(within(maya).getByRole('button', { name: 'Remove GITHUB_TOKEN from Maya Lind (maya)' }));
    await waitFor(async () => {
      expect(await memberRow('Maya Lind (maya)')).toHaveTextContent('Nothing assigned');
    });
  });

  it('excludes a member from a variable, which removes their selection, and the exclusion grants nothing back', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Exclude a member');
    await user.selectOptions(within(form).getByLabelText('Member'), 'theo');
    await user.click(within(form).getByRole('button', { name: 'Exclude' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Use uppercase letters');
    await user.type(within(form).getByLabelText('Variable name'), 'GITHUB_TOKEN');
    expect(within(form).queryByRole('alert')).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Exclude' }));
    const theo = await memberRow('theo');
    await within(theo).findByText('GITHUB_TOKEN excluded');
    expect(theo).not.toHaveTextContent('GITHUB_TOKEN → acme');
    expect(within(form).getByLabelText('Variable name')).toHaveValue('');
    await user.click(within(theo).getByRole('button', { name: 'Remove exclusion of GITHUB_TOKEN for theo' }));
    await waitFor(async () => {
      expect(await memberRow('theo')).not.toHaveTextContent('GITHUB_TOKEN excluded');
    });
    expect(await memberRow('theo')).not.toHaveTextContent('GITHUB_TOKEN →');
  });

  it('promotes a member’s personal variant to the team; its owner keeps it', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const review = await screen.findByRole('list', { name: 'Members’ personal variants' });
    const [mine] = within(review).getAllByRole('listitem');
    if (mine === undefined) throw new Error('no personal variant');
    await user.click(within(mine).getByRole('button', { name: 'Promote to the team' }));
    await user.click(
      within(mine).getByRole('button', { name: 'Make OPENROUTER_API_KEY: mine a team variant' }),
    );
    expect(await variantRow('OPENROUTER_API_KEY', 'mine')).toHaveTextContent('shared value stored');
    expect(await memberRow('theo')).toHaveTextContent('OPENROUTER_API_KEY → mine v1 · direct');
    expect(await memberRow('theo')).not.toHaveTextContent('their own');
  });

  it('deletes a member’s personal variant', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const review = await screen.findByRole('list', { name: 'Members’ personal variants' });
    const sentry = within(review).getAllByRole('listitem')[1];
    if (sentry === undefined) throw new Error('no personal variant');
    await user.click(within(sentry).getByRole('button', { name: 'Delete' }));
    await user.click(within(sentry).getByRole('button', { name: 'Delete SENTRY_DSN: samir' }));
    await waitFor(() => {
      expect(screen.queryByText('SENTRY_DSN')).not.toBeInTheDocument();
    });
    expect(db.environmentVariants.some((variant) => variant.id === 'env-5')).toBe(false);
  });

  it('says what is empty', async () => {
    db.environmentVariants = [];
    db.environmentAssignments = [];
    db.environmentExclusions = [];
    // Nobody but the viewer has joined, and the page lists no one else.
    server.use(http.get('*/api/v1/orgs/:org/members', () => HttpResponse.json({ items: [] })));
    visit('/environment');
    expect(await screen.findByText('No variants yet.')).toBeInTheDocument();
    expect(await screen.findByText('No member declared a personal variant.')).toBeInTheDocument();
    expect(
      screen.getByText('Create a variant first; members appear here once they joined.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No member to exclude yet.')).toBeInTheDocument();
  });

  it('names a member by id when the member list cannot be read', async () => {
    server.use(
      http.get('*/api/v1/orgs/:org/members', () =>
        HttpResponse.json({ error: { type: 'x', message: 'no' } }, { status: 500 }),
      ),
    );
    visit('/environment');
    expect(await memberRow(MEMBER_IDS.theo)).toHaveTextContent('GITHUB_TOKEN → acme');
    const review = await screen.findByRole('list', { name: 'Members’ personal variants' });
    expect(review).toHaveTextContent(`by ${MEMBER_IDS.theo}`);
  });

  it('says when the assignments cannot be read, and still lists the variants', async () => {
    server.use(
      http.get('*/api/v1/environment/assignments', () =>
        HttpResponse.json(
          { error: { type: 'unavailable', message: 'assignments are down' } },
          { status: 503 },
        ),
      ),
    );
    visit('/environment');
    expect(await screen.findByText('assignments are down')).toBeInTheDocument();
    expect(await variantRow('NPM_TOKEN', 'registry')).toBeInTheDocument();
    const review = await screen.findByRole('list', { name: 'Members’ personal variants' });
    // Without the assignments, nothing is said to be unassigned.
    expect(review).not.toHaveTextContent('Not assigned');
  });

  it('offers no assignment while the variants cannot be read', async () => {
    server.use(
      http.get('*/api/v1/environment/variants', () =>
        HttpResponse.json({ error: { type: 'unavailable', message: 'variants are down' } }, { status: 503 }),
      ),
    );
    visit('/environment');
    expect(await screen.findByText('variants are down')).toBeInTheDocument();
    const form = await region('Assign a variant');
    expect(form).toHaveTextContent('Create a variant first');
  });

  it('says when the personal variants cannot be read', async () => {
    server.use(
      http.get('*/api/v1/environment/variants/personal', () =>
        HttpResponse.json({ error: { type: 'unavailable', message: 'personal is down' } }, { status: 503 }),
      ),
    );
    visit('/environment');
    expect(await screen.findByText('personal is down')).toBeInTheDocument();
  });

  it('turns a rename made meanwhile by another administrator into a conflict, never overwrites it', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const acme = await variantRow('GITHUB_TOKEN', 'acme');
    await user.click(within(acme).getByRole('button', { name: 'Edit GITHUB_TOKEN: acme' }));
    db.environmentVariants = db.environmentVariants.map((variant) =>
      variant.id === 'env-1' ? { ...variant, name: 'renamed', version: 3 } : variant,
    );
    // Another write reads the list again: the row now says the new name, the open edit still holds what it read.
    const maya = await memberRow('Maya Lind (maya)');
    await user.click(within(maya).getByRole('button', { name: 'Remove GITHUB_TOKEN from Maya Lind (maya)' }));
    const row = await variantRow('GITHUB_TOKEN', 'renamed');
    await user.type(within(row).getByLabelText('New value (optional)'), 'ghp_late');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This variant changed since you read it');
    expect(db.environmentVariants.find((variant) => variant.id === 'env-1')?.name).toBe('renamed');
  });

  it('clears a member value when another member is chosen, and follows a member who left the list', async () => {
    const user = userEvent.setup();
    visit('/environment');
    const form = await region('Assign a variant');
    await user.selectOptions(
      within(form).getByLabelText('Variant'),
      'GITHUB_TOKEN: own account (per member)',
    );
    await user.type(within(form).getByLabelText('Member value'), 'ghp_for_theo');
    await user.selectOptions(within(form).getByLabelText('Member'), 'theo');
    expect(within(form).getByLabelText('Member value')).toHaveValue('');
    const exclude = await region('Exclude a member');
    await user.selectOptions(within(exclude).getByLabelText('Member'), 'theo');
    // Theo leaves: his rows stay on display, by id, and the pickers fall back to the first member.
    db.orgMembers[db.organization.id] = (db.orgMembers[db.organization.id] ?? []).filter(
      (member) => member.login !== 'theo',
    );
    const maya = await memberRow('Maya Lind (maya)');
    await user.click(within(maya).getByRole('button', { name: 'Remove GITHUB_TOKEN from Maya Lind (maya)' }));
    await waitFor(() => {
      expect(within(form).getByLabelText('Member')).toHaveDisplayValue('Lena Ortiz (lena)');
    });
    await memberRow(MEMBER_IDS.theo);
    expect(within(exclude).getByLabelText('Member')).toHaveDisplayValue('Lena Ortiz (lena)');
    expect(within(form).queryByRole('option', { name: MEMBER_IDS.theo })).toBeNull();
  });

  it('holds every button while a write is on its way', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/environment/variants', async () => delay('infinite')));
    visit('/environment');
    const form = await region('Create a variant');
    await user.type(within(form).getByLabelText('Variable name'), 'SLOW');
    await user.type(within(form).getByLabelText('Variant name'), 'one');
    await user.type(within(form).getByLabelText('Value'), 'value');
    await user.click(within(form).getByRole('button', { name: 'Create variant' }));
    expect(await within(form).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(
      within(await variantRow('NPM_TOKEN', 'registry')).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled();
  });

  it('asks to sign in again when the sign-in is too old', async () => {
    const user = userEvent.setup();
    db.signedInAt = 0;
    visit('/environment');
    const maya = await memberRow('Maya Lind (maya)');
    await user.click(within(maya).getByRole('button', { name: 'Remove GITHUB_TOKEN from Maya Lind (maya)' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(within(alert).getByRole('link', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('is an owner’s or an admin’s page', async () => {
    setDemoRole(db, 'member');
    visit('/environment');
    expect(
      await screen.findByText(
        'Only an owner or an admin of the organization manages its environment variants.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Create a variant' })).toBeNull();
  });

  it('never shows another organization the variants of this one', async () => {
    db.otherOrganizations = [otherOrganization()];
    const headers = { 'Ostrom-Org': otherOrganization().id };
    const [variants, personal, assignments] = await Promise.all(
      ['/variants', '/variants/personal', '/assignments'].map(async (path) =>
        (await fetch(`${TEST_API}/api/v1/environment${path}`, { headers })).text(),
      ),
    );
    expect(variants).not.toContain('GITHUB_TOKEN');
    expect(personal).not.toContain('OPENROUTER_API_KEY');
    expect(assignments).not.toContain(MEMBER_IDS.theo);
  });
});

describe('a team of more than a hundred people', { timeout: 15_000 }, () => {
  it('names a member beyond the first hundred, and offers them to assign to', async () => {
    const large = largeMembers().slice(0, 150);
    const far = large[130];
    if (far === undefined) throw new Error('no member 130');
    db.orgMembers[db.organization.id] = [...(db.orgMembers[db.organization.id] ?? []), ...large];
    db.environmentExclusions.push({ member: far.id, variable: 'GITHUB_TOKEN' });
    visit('/environment');
    const label = `${far.name} (${far.login})`;
    const list = await screen.findByRole('list', { name: 'Effective assignments' });
    // The second page comes by itself, after the first.
    const row = await within(list).findByRole('listitem', { name: label }, { timeout: 10_000 });
    expect(row).toHaveTextContent('GITHUB_TOKEN');
    const form = await region('Assign a variant');
    expect(within(form).getByRole('option', { name: label })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more people' })).toBeNull();
  });
});
