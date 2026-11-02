// SPDX-License-Identifier: AGPL-3.0-only
import type { ApiError } from '@gen/api/types.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
const ACME = '6f1c2a4e-8b3d-4e7a-9c5f-1d2e3f4a5b6c';

function refuse(status: number, message: string): HttpResponse<ApiError> {
  return HttpResponse.json({ error: { type: 'refused', message } }, { status });
}

async function repoList(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Governed repositories' });
}

function rowOf(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => item.querySelector('.o-row__title')?.textContent === name);
  if (row === undefined) throw new Error(`no repository ${name}`);
  return row;
}

async function analysis(): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Rules from your repositories' });
  const section = heading.closest('section');
  if (section === null) throw new Error('no analysis');
  return section;
}

describe('the GitHub screen', () => {
  it('shows the app installed, where to change its repositories, and the repositories it governs', async () => {
    visit('/github');
    expect(await screen.findByRole('heading', { level: 1, name: 'GitHub' })).toBeInTheDocument();
    expect(await screen.findByText('Installed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ostrom-dev' })).toHaveAttribute(
      'href',
      'https://github.com/apps/ostrom-dev',
    );
    expect(screen.getByRole('link', { name: 'Choose repositories on GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/app/install/start?org=${ACME}`,
    );
    const list = await repoList();
    expect(screen.getByText('The app reads 6 repositories.')).toBeInTheDocument();
    // Live ones first, the latest pushed first; one never pushed after; archived last.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.o-row__title')?.textContent),
    ).toEqual(['web', 'api', 'infra', 'mobile', 'docs', 'legacy-billing']);
    expect(rowOf(list, 'api')).toHaveTextContent(
      'The billing and accounts API' + 'Kotlin · branch main · pushed Oct 29, 2026 · teams backend',
    );
    expect(rowOf(list, 'mobile')).toHaveTextContent('TypeScript · branch develop · pushed Oct 24, 2026');
    expect(rowOf(list, 'mobile')).not.toHaveTextContent('teams');
    expect(rowOf(list, 'docs')).toHaveTextContent('MDX · branch main');
    expect(rowOf(list, 'docs')).not.toHaveTextContent('pushed');
    expect(rowOf(list, 'legacy-billing')).toHaveTextContent('Archived');
    expect(rowOf(list, 'web')).not.toHaveTextContent('Archived');
  });

  it('finds a repository by its name or description', async () => {
    const user = userEvent.setup();
    visit('/github');
    const list = await repoList();
    const search = screen.getByRole('searchbox', { name: 'Find a repository' });
    await user.type(search, 'BILLING');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await user.clear(search);
    await user.type(search, 'the   service');
    expect(within(await repoList()).getAllByRole('listitem')).toHaveLength(1);
    await user.type(search, ' nowhere');
    expect(screen.getByText('No repository matches.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Governed repositories' })).toBeNull();
  });

  it('shows a few repositories without a filter', async () => {
    // An empty description shows no line; a push date that is not one shows nothing.
    db.repos[ACME] = [
      { name: 'solo', description: '', defaultBranch: 'main', archived: false, pushedAt: 'not a date' },
    ];
    visit('/github');
    const list = await repoList();
    expect(screen.getByText('The app reads 1 repository.')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(rowOf(list, 'solo')).toHaveTextContent('branch main');
    expect(rowOf(list, 'solo')).not.toHaveTextContent('pushed');
  });

  it('says when the server holds more, and that the search reads the ones shown only', async () => {
    db.repos[ACME] = [{ name: 'solo', defaultBranch: 'main', archived: false }];
    server.use(
      http.get('*/api/v1/repos', () =>
        HttpResponse.json({ items: (db.repos[ACME] ?? []).slice(0, 1), next: 'b' }),
      ),
    );
    visit('/github');
    await repoList();
    expect(
      screen.getByText('The app reads more than 1 repository; the first are shown.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Find a repository' })).toHaveAccessibleDescription(
      'The search reads the repositories shown only.',
    );
  });

  it('says when the app was given no repository', async () => {
    db.repos[ACME] = [];
    visit('/github');
    expect(await screen.findByText('No repository yet')).toBeInTheDocument();
    expect(screen.queryByText(/^The app reads/)).toBeNull();
  });

  it('offers to install the app on an organization that has not, and nothing else', async () => {
    db.githubInstalled[ACME] = false;
    visit('/github');
    expect(await screen.findByText('Not installed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Install on GitHub' })).toHaveAttribute(
      'href',
      `${TEST_API}/api/v1/github/app/install/start?org=${ACME}`,
    );
    expect(screen.queryByRole('heading', { name: 'Governed repositories' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Rules from your repositories' })).toBeNull();
  });

  it('lets a member read, and says who installs and analyses', async () => {
    setDemoRole(db, 'member');
    visit('/github');
    expect(
      await screen.findByText('An owner or an admin installs the app and chooses its repositories.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Choose repositories on GitHub' })).toBeNull();
    const section = await analysis();
    expect(await within(section).findByText(/^Ostrom reads the governed repositories/)).toBeInTheDocument();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('shows the app without its page when the server gives none', async () => {
    server.use(
      http.get('*/api/v1/github/app', () => HttpResponse.json({ installed: false, slug: 'ostrom' })),
    );
    visit('/github');
    expect(await screen.findByText('ostrom')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ostrom' })).toBeNull();
  });

  it('links the app page only over https', async () => {
    server.use(
      http.get('*/api/v1/github/app', () =>
        HttpResponse.json({ installed: false, slug: 'ostrom', htmlUrl: 'javascript:alert(1)' }),
      ),
    );
    visit('/github');
    expect(await screen.findByText('ostrom')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ostrom' })).toBeNull();
  });

  it('shows no app name when the server knows no app', async () => {
    server.use(http.get('*/api/v1/github/app', () => HttpResponse.json({ installed: false })));
    visit('/github');
    expect(await screen.findByText('Not installed')).toBeInTheDocument();
    expect(screen.queryByText('App')).toBeNull();
  });

  it('says why the app or its repositories were not read', async () => {
    server.use(http.get('*/api/v1/github/app', () => refuse(500, 'github is down')));
    visit('/github');
    expect(await screen.findByText('github is down')).toBeInTheDocument();
  });

  it('says why the repositories were not read', async () => {
    server.use(http.get('*/api/v1/repos', () => refuse(500, 'repos are down')));
    visit('/github');
    expect(await screen.findByText('repos are down')).toBeInTheDocument();
  });

  it('is in the main menu', async () => {
    visit('/');
    expect(await screen.findByRole('link', { name: 'GitHub' })).toHaveAttribute('href', '/github');
  });
});

describe('coming back from GitHub', () => {
  it('says the app is installed, and cleans the address', async () => {
    const router = visit('/github?installed=1');
    expect(
      await screen.findByText('The GitHub App is installed. Its repositories show below.'),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
    expect(screen.getByText('The GitHub App is installed. Its repositories show below.')).toBeInTheDocument();
  });

  it('says nothing of an installation the server does not know, nor of a link that says none', async () => {
    db.githubInstalled[ACME] = false;
    const router = visit('/github?installed=1');
    expect(await screen.findByText('Not installed')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
    expect(screen.queryByText(/^The GitHub App is installed/)).toBeNull();
  });

  it('says it after a person in several organizations chose one', async () => {
    const user = userEvent.setup();
    db.otherOrganizations = [otherOrganization()];
    const router = visit('/github?installed=1');
    const picker = await screen.findByRole('dialog', { name: 'Which organization?' });
    const list = await within(picker).findByRole('list', { name: 'Your organizations' });
    await user.click(within(list).getByRole('button', { name: 'Acme' }));
    expect(
      await screen.findByText('The GitHub App is installed. Its repositories show below.'),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
  });

  it('reads installed=0 as nothing, and cleans the address', async () => {
    const router = visit('/github?installed=0');
    await repoList();
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
    expect(screen.queryByText(/^The GitHub App is installed/)).toBeNull();
  });

  it('tags an unfinished visit to GitHub as such, the app installed or not', async () => {
    visit('/github?error=denied');
    expect(await screen.findByText('Not finished')).toBeInTheDocument();
    expect(await screen.findByText('Installed')).toBeInTheDocument();
  });

  it.each([
    ['denied', 'The installation was cancelled on GitHub.'],
    ['expired', 'The installation took too long. Start it again.'],
    ['forbidden', 'Only an owner or an admin of the organization installs the app.'],
    ['state_mismatch', 'GitHub did not finish the installation. Start it again.'],
    ['Not%20a%20type!', 'GitHub did not finish the installation. Start it again.'],
  ])('puts the error type %s in words', async (type, words) => {
    const router = visit(`/github?error=${type}`);
    expect(await screen.findByText(words)).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
  });

  it('reads an error that is not text as unknown', async () => {
    visit('/github?error=42');
    expect(
      await screen.findByText('GitHub did not finish the installation. Start it again.'),
    ).toBeInTheDocument();
  });
});

describe('the analysis of the rules', () => {
  it('starts, follows the run as it goes, and leads to the rules once ready', async () => {
    const user = userEvent.setup();
    visit('/github');
    const section = await analysis();
    await user.click(await within(section).findByRole('button', { name: 'Analyse the repositories' }));
    expect(await within(section).findByText('Reading the repositories…')).toBeInTheDocument();
    expect(within(section).getByRole('progressbar', { name: 'Analysis 5 % done' })).toBeInTheDocument();
    expect(within(section).queryByRole('button')).toBeNull();
    // Read again while it runs.
    expect(
      await within(section).findByRole('progressbar', { name: 'Analysis 40 % done' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('counts one rule and one workflow as such', async () => {
    db.analyses[ACME] = { phase: 'ready', progress: 1, fails: false };
    db.rules = db.rules.slice(0, 1);
    db.workflows = db.workflows.slice(0, 1);
    visit('/github');
    expect(await within(await analysis()).findByText('1 rule and 1 workflow proposed.')).toBeInTheDocument();
  });

  it('reads the state again when a start is refused, and shows the run instead of the refusal', async () => {
    const user = userEvent.setup();
    visit('/github');
    const section = await analysis();
    const button = await within(section).findByRole('button', { name: 'Analyse the repositories' });
    // Another admin started a run meanwhile.
    db.analyses[ACME] = { phase: 'connect', progress: 0.05, fails: false };
    await user.click(button);
    expect(await within(section).findByText('Reading the repositories…')).toBeInTheDocument();
    expect(within(section).queryByText('An analysis is running.')).toBeNull();
  });

  it('starts a run over a failed one the page had not seen yet', async () => {
    const user = userEvent.setup();
    visit('/github');
    const section = await analysis();
    const button = await within(section).findByRole('button', { name: 'Analyse the repositories' });
    // A run failed meanwhile, in another tab: as on the server, a start goes through.
    db.analyses[ACME] = { phase: 'failed', progress: 1, fails: true };
    await user.click(button);
    expect(await within(section).findByText('Reading the repositories…')).toBeInTheDocument();
  });

  it('says a failing read while a run goes on, and keeps the run on screen', async () => {
    db.analyses[ACME] = { phase: 'connect', progress: 0.05, fails: false };
    visit('/github');
    const section = await analysis();
    expect(await within(section).findByText('Reading the repositories…')).toBeInTheDocument();
    server.use(http.get('*/api/v1/analysis/state', () => refuse(500, 'a blip'), { once: true }));
    expect(await within(section).findByText('a blip', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(section).getByRole('progressbar')).toBeInTheDocument();
  });

  it('keeps the refusal of a restart while the run stays failed', async () => {
    const user = userEvent.setup();
    db.analyses[ACME] = { phase: 'failed', progress: 1, fails: true };
    server.use(http.post('*/api/v1/analysis/restart', () => refuse(503, 'No engine yet.')));
    visit('/github');
    const section = await analysis();
    await user.click(await within(section).findByRole('button', { name: 'Start again' }));
    expect(await within(section).findByText('No engine yet.')).toBeInTheDocument();
  });

  it('says what the last analysis proposed, and analyses again', async () => {
    const user = userEvent.setup();
    db.analyses[ACME] = { phase: 'ready', progress: 1, fails: false };
    visit('/github');
    const section = await analysis();
    expect(
      await within(section).findByText(
        `${String(db.rules.length)} rules and ${String(db.workflows.length)} workflows proposed.`,
      ),
    ).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Review the rules' })).toHaveAttribute('href', '/rules');
    server.use(http.post('*/api/v1/analysis/start', async () => delay('infinite')));
    await user.click(within(section).getByRole('button', { name: 'Analyse again' }));
    expect(within(section).getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('says why the last analysis stopped, and restarts it', async () => {
    const user = userEvent.setup();
    db.analyses[ACME] = { phase: 'failed', progress: 1, fails: true };
    visit('/github');
    const section = await analysis();
    expect(await within(section).findByText('GitHub refused to list the code owners.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Start again' }));
    expect(await within(section).findByText('Reading the repositories…')).toBeInTheDocument();
  });

  it('says when the server gave no reason for a stop', async () => {
    server.use(
      http.get('*/api/v1/analysis/state', () =>
        HttpResponse.json({ phase: 'failed', repos: [], rules: [], workflows: [] }),
      ),
    );
    visit('/github');
    expect(await within(await analysis()).findByText('The server did not say why.')).toBeInTheDocument();
  });

  it('says why an analysis did not start', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/analysis/start', () => refuse(409, 'An analysis is running.')));
    visit('/github');
    const section = await analysis();
    await user.click(await within(section).findByRole('button', { name: 'Analyse the repositories' }));
    expect(await within(section).findByText('An analysis is running.')).toBeInTheDocument();
  });

  it.each([404, 501])(
    'shows nothing of an analysis the server does not serve yet (%i), and no error',
    async (status) => {
      server.use(http.get('*/api/v1/analysis/state', () => refuse(status, 'not served')));
      visit('/github');
      await repoList();
      expect(screen.queryByRole('heading', { name: 'Rules from your repositories' })).toBeNull();
      expect(screen.queryByText('not served')).toBeNull();
    },
  );

  it('says why the analysis was not read', async () => {
    server.use(http.get('*/api/v1/analysis/state', () => refuse(500, 'analysis is down')));
    visit('/github');
    expect(await within(await analysis()).findByText('analysis is down')).toBeInTheDocument();
  });
});
