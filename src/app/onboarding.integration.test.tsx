// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiError } from '@gen/api/types.gen';
import { delay, http, HttpResponse } from 'msw';
import { GUIDE_CLI_KEY, GUIDE_HIDDEN_KEY } from '@/features/onboarding';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { freshAccount } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

afterEach(() => {
  localStorage.clear();
});

async function guide(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Set up' });
  const section = heading.closest('section');
  if (section === null) throw new Error('no setup guide');
  return section;
}

function step(section: HTMLElement, title: string): HTMLElement {
  const item = within(section)
    .getAllByRole('listitem')
    .find((row) => row.textContent.includes(title));
  if (item === undefined) throw new Error(`no step ${title}`);
  return item;
}

function refuse(status: number, message: string): HttpResponse<ApiError> {
  return HttpResponse.json({ error: { type: 'refused', message } }, { status });
}

describe('the home screen', () => {
  it('asks someone signed out to sign in', async () => {
    server.use(http.get('*/api/v1/orgs', () => refuse(401, 'sign in')));
    visit('/');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Every agent change, approved by the right person.',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Sign in to set up your organization.')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/signin',
    );
  });

  it('shows the shape of the page while the organizations are read', async () => {
    server.use(http.get('*/api/v1/orgs', async () => delay('infinite')));
    visit('/');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says why the organizations were not read', async () => {
    server.use(http.get('*/api/v1/orgs', () => refuse(500, 'orgs are down')));
    visit('/');
    expect(await screen.findByText('orgs are down')).toBeInTheDocument();
  });

  it('asks which organization to a person in several', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    visit('/');
    expect(
      await screen.findByText('Which organization?', { selector: '.o-empty__title' }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    await user.click(
      within(screen.getByRole('main')).getByRole('button', { name: 'Choose an organization' }),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('creating an organization', () => {
  it('creates a first organization with a short name from its name, then opens its setup guide', async () => {
    const user = userEvent.setup();
    freshAccount(db);
    visit('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your organization' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Invited to a team? Open the link from your invitation e-mail instead.'),
    ).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'Organization name' });
    // Nothing typed: no short name, nothing to send.
    expect(screen.queryByText(/^Short name:/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Create the organization' })).toBeDisabled();
    await user.type(name, 'Wayne Enterprises');
    const hint = screen.getByText(/^Short name: wayne-enterprises/);
    expect(name).toHaveAttribute('aria-describedby', hint.id);
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wayne Enterprises' })).toBeInTheDocument();
    expect(db.organization.name).toBe('Wayne Enterprises');
    expect(db.slugs[db.organization.id]).toBe('wayne-enterprises');
    expect(useOrgStore.getState().current).toBe(db.organization.id);
    const section = await guide();
    expect(await within(section).findByText('1 of 6 done')).toBeInTheDocument();
    expect(step(section, 'Create the organization')).toHaveTextContent('(done)');
    expect(step(section, 'Connect GitHub')).toHaveAttribute('aria-current', 'step');
    expect(step(section, 'Invite your team')).not.toHaveAttribute('aria-current');
  });

  it('checks the name before sending it', async () => {
    const user = userEvent.setup();
    freshAccount(db);
    visit('/');
    const name = await screen.findByRole('textbox', { name: 'Organization name' });
    await user.type(name, '   ');
    expect(screen.getByText('The organization needs a name.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    // No short name for a name made of spaces.
    expect(name).not.toHaveAttribute('aria-describedby');
    fireEvent.change(name, { target: { value: 'x'.repeat(101) } });
    expect(screen.getByText('The name is at most 100 characters.')).toBeInTheDocument();
    fireEvent.change(name, { target: { value: 'Acme\u0007' } });
    expect(screen.getByText('The name cannot hold control characters.')).toBeInTheDocument();
    const go = screen.getByRole('button', { name: 'Create the organization' });
    expect(go).toBeDisabled();
    // A form sent anyway (Enter in the field) sends nothing.
    fireEvent.submit(go);
    expect(db.noOrganization).toBe(true);
  });

  it('lets the short name be chosen, checks it, and says when it is taken', async () => {
    const user = userEvent.setup();
    freshAccount(db);
    db.elsewhere = [];
    visit('/');
    await user.type(await screen.findByRole('textbox', { name: 'Organization name' }), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    const slug = screen.getByRole('textbox', { name: 'Short name' });
    expect(slug).toHaveValue('acme');
    await user.clear(slug);
    await user.type(slug, 'Bad Slug');
    expect(slug).toHaveValue('bad slug');
    expect(screen.getByText('2 to 39 lower case letters, digits and single dashes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create the organization' })).toBeDisabled();
    await user.clear(slug);
    await user.type(slug, 'admin');
    expect(screen.getByText('This short name is kept for Ostrom’s own pages.')).toBeInTheDocument();
    await user.clear(slug);
    await user.type(slug, 'acme-corp');
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByText('This short name is taken. Choose another.')).toBeInTheDocument();
    expect(slug).toHaveAttribute('aria-invalid', 'true');
    // Changed, it is no longer the one refused.
    await user.type(slug, 'x');
    expect(screen.queryByText('This short name is taken. Choose another.')).toBeNull();
    await user.clear(slug);
    await user.type(slug, 'acme-labs');
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(db.slugs[db.organization.id]).toBe('acme-labs');
  });

  it('acts in the new organization when the person already had one, kept with their login', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/orgs', () => HttpResponse.json({ items: [] })));
    visit('/');
    await user.type(await screen.findByRole('textbox', { name: 'Organization name' }), 'Stark');
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Stark' })).toBeInTheDocument();
    expect(db.otherOrganizations.map((organization) => organization.name)).toEqual(['Stark']);
    expect(useOrgStore.getState().current).toBe('org-stark');
  });

  it('chooses the new organization without a login when the person cannot be read', async () => {
    const user = userEvent.setup();
    freshAccount(db);
    server.use(http.get('*/api/v1/auth/me', () => refuse(500, 'me is down')));
    visit('/');
    await user.type(await screen.findByRole('textbox', { name: 'Organization name' }), 'Wayne');
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Wayne' })).toBeInTheDocument();
    expect(useOrgStore.getState().current).toBe('org-wayne');
  });

  it('says why the organization was not created, and holds the button while it is', async () => {
    const user = userEvent.setup();
    let answer = 0;
    freshAccount(db);
    server.use(
      http.post('*/api/v1/orgs', async () => {
        answer += 1;
        if (answer === 1) return refuse(500, 'creation is down');
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/');
    await user.type(await screen.findByRole('textbox', { name: 'Organization name' }), 'Wayne');
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('creation is down');
    await user.click(screen.getByRole('button', { name: 'Create the organization' }));
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });
});

describe('the setup guide', () => {
  it('shows what is set up, leads to where each step is done, and gives the CLI commands to copy', async () => {
    const user = userEvent.setup();
    visit('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Acme' })).toBeInTheDocument();
    expect(
      screen.getByText('From an empty organization to a first agent change approved.'),
    ).toBeInTheDocument();
    const section = await guide();
    expect(await within(section).findByText('5 of 6 done')).toBeInTheDocument();
    expect(within(section).getByRole('progressbar')).toHaveAttribute('value', '5');
    expect(step(section, 'Install the CLI')).toHaveAttribute('aria-current', 'step');
    expect(within(section).getByRole('link', { name: 'Install the app' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/app/install/start?org=${ACME}`,
    );
    expect(within(section).getByRole('link', { name: 'Invite' })).toHaveAttribute('href', '/members');
    expect(within(section).getByRole('link', { name: 'Add an account' })).toHaveAttribute(
      'href',
      '/accounts',
    );
    expect(within(section).getByRole('link', { name: 'Open workflows' })).toHaveAttribute(
      'href',
      '/workflows',
    );
    expect(within(section).getByRole('textbox', { name: 'Sign in command' })).toHaveValue(
      `ostrom login --server ${TEST_API}`,
    );
    expect(within(section).getByRole('textbox', { name: 'Repository setup command' })).toHaveValue(
      'ostrom init',
    );
    await user.click(within(section).getByRole('button', { name: 'Copy Agent command' }));
    expect(await within(section).findByText('Copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('ostrom claude');
    expect(within(section).getByRole('link', { name: 'How to install the ostrom command' })).toHaveAttribute(
      'href',
      'https://ostrom.run/docs/install',
    );
  });

  it('is put away and brought back, for this organization in this browser', async () => {
    const user = userEvent.setup();
    visit('/');
    const section = await guide();
    await user.click(within(section).getByRole('button', { name: 'Hide the guide' }));
    expect(screen.queryByRole('heading', { level: 2, name: 'Set up' })).toBeNull();
    expect(localStorage.getItem(`${GUIDE_HIDDEN_KEY}.${ACME}`)).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Show the setup guide' }));
    expect(await guide()).toBeInTheDocument();
    expect(localStorage.getItem(`${GUIDE_HIDDEN_KEY}.${ACME}`)).toBeNull();
  });

  it('opens put away when it was put away before', async () => {
    localStorage.setItem(`${GUIDE_HIDDEN_KEY}.${ACME}`, '1');
    visit('/');
    expect(await screen.findByRole('button', { name: 'Show the setup guide' })).toBeInTheDocument();
  });

  it('leaves a step it cannot read open, never done, and says nothing went wrong', async () => {
    setDemoRole(db, 'member');
    server.use(
      http.get('*/api/v1/github/app', () => refuse(404, 'not served')),
      http.get('*/api/v1/workflows', () => refuse(404, 'not served')),
    );
    visit('/');
    const section = await guide();
    // Organization, team (five people) and accounts are done; GitHub and workflows are not known.
    expect(await within(section).findByText('3 of 6 done')).toBeInTheDocument();
    expect(step(section, 'Connect GitHub')).not.toHaveTextContent('(done)');
    expect(step(section, 'Connect GitHub')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByRole('alert')).toBeNull();
    // A member installs nothing and invites nobody: the guide says who does.
    expect(
      within(step(section, 'Connect GitHub')).getByText('An owner or an admin does this.'),
    ).toBeInTheDocument();
    expect(
      within(step(section, 'Invite your team')).getByText('An owner or an admin does this.'),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('link', { name: 'Install the app' })).toBeNull();
    expect(within(section).queryByRole('link', { name: 'Invite' })).toBeNull();
  });

  it('takes the person’s word that the CLI is set up, then says the organization is all set', async () => {
    const user = userEvent.setup();
    visit('/');
    const section = await guide();
    expect(await within(section).findByText('5 of 6 done')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'It is set up' }));
    expect(
      within(section).getByText('All set: protected agent changes now wait for a yes.'),
    ).toBeInTheDocument();
    expect(step(section, 'Install the CLI')).toHaveTextContent('(done)');
    expect(within(section).queryByRole('button', { name: 'It is set up' })).toBeNull();
    expect(section.querySelector('[aria-current]')).toBeNull();
    expect(localStorage.getItem(`${GUIDE_CLI_KEY}.${ACME}`)).toBe('1');
  });

  it('counts the invitations waiting as a team invited', async () => {
    db.orgMembers[ACME] = (db.orgMembers[ACME] ?? []).filter((member) => member.login === 'maya');
    visit('/');
    const section = await guide();
    await vi.waitFor(() => {
      expect(step(section, 'Invite your team')).toHaveTextContent('(done)');
    });
  });
});
