// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait } from '@gen/api/types.gen';
import { handleCapabilities, handleGetMe, handleListWaits } from '@gen/api/msw.gen';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { me } from '@/mocks/fixtures/approvals';
import { MEMBER_IDS, otherOrganization } from '@/mocks/fixtures/organization';
import { DEMO_LOGIN, setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();
const SLOW = { timeout: 4_000 };

const id = (n: number): string => `0b9d3a52-7c41-4e0a-9d63-5a1f0c7e8a0${String(n)}`;
const SHIP = id(1);

const refused = (status: number, type: string, message: string) =>
  HttpResponse.json({ error: { type, message } }, { status });

function wait(n: number): Wait {
  const found = db.waits.find((item) => item.id === id(n));
  if (found === undefined) throw new Error(`no fixture ${String(n)}`);
  return found;
}

function replace(n: number, change: (item: Wait) => Wait): void {
  db.waits = db.waits.map((item) => (item.id === id(n) ? change(item) : item));
}

/** The demo person as a plain member: no administrator's right over the waits of others. */
function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    handleGetMe(() =>
      HttpResponse.json({
        ...me,
        member: { ...me.member, id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        organization: db.organization,
      }),
    ),
  );
}

/** The line of the list that holds `link`. */
function lineOf(link: HTMLElement): HTMLElement {
  const line = link.closest('li');
  if (line === null) throw new Error('the link is not in a line');
  return line;
}

describe('the waiting list', () => {
  it('lists what is asked of the person or by them, newest first, with who asked, the session and the age', async () => {
    visit('/waits');
    expect(await screen.findByRole('heading', { level: 1, name: 'Waiting for you' })).toBeInTheDocument();
    const ship = await screen.findByRole('link', { name: /Ship the ledger migration to production\?/ });
    expect(ship).toHaveAttribute('href', `/waits/${SHIP}`);
    const rows = within(screen.getByRole('region', { name: 'Waiting for you' })).getAllByRole('link');
    expect(rows.map((row) => within(row).getByText(/^(Open)$/).textContent)).toEqual([
      'Open',
      'Open',
      'Open',
      'Open',
    ]);
    expect(within(ship).getByText('Asked by Samir Haddad · Session ses-7f3a')).toBeInTheDocument();
    expect(within(ship).getByText('5 min. ago')).toHaveAttribute('dateTime', wait(1).createdAt);
    // Asked of the person: garnet. Asked of someone else (by the person's agent): amber.
    expect(within(ship).getByText('Open').closest('[data-approval]')).toHaveAttribute(
      'data-approval',
      'waiting',
    );
    const theirs = lineOf(screen.getByRole('link', { name: /Does the billing team own the retry job\?/ }));
    expect(within(theirs).getByText('Open').closest('[data-approval]')).toBeNull();
    expect(within(theirs).getByText('Asked by you · Session ses-51c0')).toBeInTheDocument();
    // What another team's agent asks of another person is not listed.
    expect(screen.queryByText('Wake me in an hour')).toBeNull();
  });

  it('shows the answered and the cancelled ones with their filter, and says when there are none', async () => {
    const user = userEvent.setup();
    visit('/waits');
    await screen.findByRole('link', { name: /Ship the ledger/ });
    const filters = screen.getByRole('group', { name: 'Show' });
    expect(within(filters).getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filters).getByRole('button', { name: 'Answered' }));
    expect(await screen.findByRole('link', { name: /Rotate the staging key\?/ })).toBeInTheDocument();
    expect(document.querySelector('.o-badge--success')).toHaveTextContent('Answered');
    expect(screen.queryByText('Ship the ledger migration to production?')).toBeNull();

    await user.click(within(filters).getByRole('button', { name: 'Cancelled' }));
    expect(await screen.findByRole('link', { name: /Pick a logo/ })).toBeInTheDocument();
  });

  it('says when there is nothing in a state', async () => {
    const user = userEvent.setup();
    db.waits = [];
    visit('/waits');
    expect(await screen.findByText('Nothing is waiting')).toBeInTheDocument();
    expect(screen.getByText(/A wait shows here as soon as an agent asks/)).toBeInTheDocument();
    const filters = screen.getByRole('group', { name: 'Show' });
    await user.click(within(filters).getByRole('button', { name: 'Answered' }));
    expect(await screen.findByText('No answered waits')).toBeInTheDocument();
    await user.click(within(filters).getByRole('button', { name: 'Cancelled' }));
    expect(await screen.findByText('No cancelled waits')).toBeInTheDocument();
  });

  it('keeps only what is asked of the person when they tick the box, asking for mine=true', async () => {
    const user = userEvent.setup();
    const asked: string[] = [];
    traffic.onRequest((request) => {
      const url = new URL(request.url);
      if (url.pathname === '/api/v1/waits') asked.push(url.search);
    });
    visit('/waits');
    await screen.findByRole('link', { name: /Does the billing team own the retry job\?/ });
    await user.click(screen.getByRole('checkbox', { name: 'Only what is asked of me' }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Does the billing team own/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Ship the ledger/ })).toBeInTheDocument();
    expect(asked.some((search) => search.includes('mine=true') && search.includes('status=open'))).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Only what is asked of me' }));
    expect(await screen.findByRole('link', { name: /Does the billing team own/ })).toBeInTheDocument();
  });

  it('lets an administrator list everyone’s waits (assignee=all), and no one else', async () => {
    const user = userEvent.setup();
    replace(3, (item) => ({ ...item, assignee: MEMBER_IDS.theo, createdBy: MEMBER_IDS.samir }));
    const asked: string[] = [];
    traffic.onRequest((request) => {
      const url = new URL(request.url);
      if (url.pathname === '/api/v1/waits') asked.push(url.search);
    });
    visit('/waits');
    expect(screen.queryByRole('link', { name: /Does the billing team own/ })).toBeNull();
    const everyone = await screen.findByRole('checkbox', { name: 'Everyone’s waits' }, SLOW);
    await user.click(everyone);
    expect(await screen.findByRole('link', { name: /Does the billing team own/ }, SLOW)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Only what is asked of me' })).toBeDisabled();
    expect(asked.some((search) => search.includes('assignee=all'))).toBe(true);
    await user.click(everyone);
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Does the billing team own/ })).toBeNull();
    });
  });

  it('does not offer everyone’s waits to a plain member, whom the server refuses', async () => {
    asMember();
    visit('/waits');
    await screen.findByRole('link', { name: /Ship the ledger/ }, SLOW);
    expect(screen.queryByRole('checkbox', { name: 'Everyone’s waits' })).toBeNull();
    expect((await fetch('http://ostrom.test/api/v1/waits?assignee=all')).status).toBe(403);
  });

  it('reads older pages by keyset (before = next) when asked, and keeps what it read when a page fails', async () => {
    const user = userEvent.setup();
    db.waits = Array.from({ length: 60 }, (_, at) => ({
      ...wait(2),
      id: `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`,
      question: { title: `Wait number ${String(at)}` },
    }));
    const asked: string[] = [];
    traffic.onRequest((request) => {
      const url = new URL(request.url);
      if (url.pathname === '/api/v1/waits') asked.push(url.search);
    });
    visit('/waits');
    expect(await screen.findByRole('link', { name: /Wait number 0(?!\d)/ }, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Wait number 50(?!\d)/ })).toBeNull();

    // The next page fails: what was read stays, and the page says so.
    server.use(handleListFailing());
    await user.click(screen.getByRole('button', { name: 'Show older waits' }));
    expect(await screen.findByText('the server is busy', undefined, SLOW)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Wait number 49(?!\d)/ })).toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Show older waits' }));
    expect(await screen.findByRole('link', { name: /Wait number 59(?!\d)/ }, SLOW)).toBeInTheDocument();
    expect(asked.some((search) => search.includes('before=00000000-0000-4000-8000-000000000049'))).toBe(true);
    // The last page: nothing older to ask for.
    expect(screen.queryByRole('button', { name: 'Show older waits' })).toBeNull();
  });

  it('never lists another organization’s waits', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    act(() => {
      useOrgStore.getState().choose(globex.id, DEMO_LOGIN);
    });
    visit('/waits');
    expect(await screen.findByText('Nothing is waiting', undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText('Ship the ledger migration to production?')).toBeNull();
  });

  it('says why it cannot read the list', async () => {
    server.use(handleListFailing());
    visit('/waits');
    expect(await screen.findByText('the server is busy', undefined, SLOW)).toBeInTheDocument();
  });
});

/** The body the console sent to `POST /waits/{id}/answer`, once it did. */
function captureAnswers(): unknown[] {
  const bodies: unknown[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/answer')) {
      void request
        .clone()
        .json()
        .then((body: unknown) => bodies.push(body));
    }
  });
  return bodies;
}

describe('the mock server, as the real one answers', () => {
  const call = async (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`http://ostrom.test/api/v1/waits${path}`, init);
  const post = async (path: string, body: unknown): Promise<Response> =>
    call(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('refuses a page size outside 1 to 100, and a cursor no page gave', async () => {
    visit('/waits');
    expect((await call('?limit=0')).status).toBe(400);
    expect((await call('?limit=101')).status).toBe(400);
    expect((await call('?before=00000000-0000-4000-8000-00000000dead')).status).toBe(400);
  });

  it('refuses to answer a cloud session’s own request, and a wait that is not asked of the person', async () => {
    visit('/waits');
    const unknown = '00000000-0000-4000-8000-00000000dead';
    expect((await post(`/${unknown}/answer`, { action: 'done' })).status).toBe(404);
    expect((await post(`/${unknown}/cancel`, {})).status).toBe(404);
    expect((await post(`/${id(4)}/answer`, { action: 'done' })).status).toBe(409);
    asMember();
    expect((await post(`/${id(3)}/answer`, { action: 'done' })).status).toBe(403);
    expect((await post(`/${id(2)}/answer`, { nope: true })).status).toBe(400);
    expect((await post(`/${id(2)}/answer`, { action: 'nope' })).status).toBe(400);
    expect((await post(`/${id(1)}/answer`, { action: 'later' })).status).toBe(400);
    expect((await post(`/${id(1)}/cancel`, {})).status).toBe(200);
    expect((await post(`/${id(1)}/cancel`, {})).status).toBe(409);
    expect((await post(`/${id(1)}/answer`, { action: 'later' })).status).toBe(409);
  });
});

describe('a wait', () => {
  it('shows its question: who asked, the session, the body as safe Markdown and the things to look at', async () => {
    visit(`/waits/${SHIP}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ship the ledger migration to production?' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Asked by Samir Haddad · /)).toBeInTheDocument();

    const about = screen.getByRole('region', { name: 'The wait' });
    expect(within(about).getByText('Open')).toBeInTheDocument();
    expect(within(about).getByText('you')).toBeInTheDocument();
    expect(within(about).getByRole('link', { name: 'ses-7f3a' })).toHaveAttribute(
      'href',
      '/sessions/ses-7f3a',
    );

    const body = screen.getByRole('region', { name: 'Details' });
    expect(within(body).getByText('2026_11_add_ledger').tagName).toBe('CODE');
    expect(within(body).getByText('two').tagName).toBe('STRONG');
    expect(within(body).getByText('safe').tagName).toBe('EM');
    expect(within(body).getAllByRole('listitem')).toHaveLength(4);
    expect(within(body).getByText('Nothing runs before you say so.').tagName).toBe('BLOCKQUOTE');
    expect(within(body).getByText('make migrate ENV=prod').closest('pre')).not.toBeNull();
    const runbook = within(body).getByRole('link', { name: 'runbook' });
    expect(runbook).toHaveAttribute('href', 'https://docs.acme.dev/runbooks/ledger');
    expect(runbook).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    // Raw HTML stays text, and a link that is not http(s) is not a link.
    expect(body.querySelector('script')).toBeNull();
    expect(within(body).getByText(/<script>window.stolen = true<\/script>/)).toBeInTheDocument();
    expect(within(body).queryByRole('link', { name: 'not a link' })).toBeNull();
    expect(within(body).getByText(/not a link/)).toBeInTheDocument();

    const refs = screen.getByRole('region', { name: 'To look at' });
    expect(within(refs).getByRole('link', { name: 'The migration session' })).toHaveAttribute(
      'href',
      '/sessions/ses-7f3a',
    );
    expect(within(refs).getByRole('link', { name: 'Ledger plan' })).toHaveAttribute(
      'href',
      '/artifacts#art-ledger-plan',
    );
    const external = within(refs).getByRole('link', { name: 'Pull request 412' });
    expect(external).toHaveAttribute('href', 'https://github.com/acme/billing-api/pull/412');
    expect(external).toHaveAttribute('target', '_blank');
    expect(within(refs).queryByRole('link', { name: 'Not a link' })).toBeNull();
    expect(within(refs).getByText('Not a link')).toBeInTheDocument();
    expect(within(refs).getByText('note')).toBeInTheDocument();
  });

  it('is not found for a wait the person may not read', async () => {
    visit('/waits/00000000-0000-4000-8000-00000000dead');
    expect(await screen.findByText('wait not found')).toBeInTheDocument();
  });

  it('is not found in another organization', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    act(() => {
      useOrgStore.getState().choose(globex.id, DEMO_LOGIN);
    });
    visit(`/waits/${SHIP}`);
    expect(await screen.findByText('wait not found', undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByText('Ship the ledger migration to production?')).toBeNull();
  });

  it('shows the typed fields with their defaults, help and required marks', async () => {
    visit(`/waits/${SHIP}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    expect(within(form).getByText('Before you answer')).toBeInTheDocument();
    expect(within(form).getByText('Staging passed all 214 checks.')).toBeInTheDocument();
    // text: a short maxLength is a line, none is a box, and the default fills it.
    expect(within(form).getByLabelText('Reason').tagName).toBe('INPUT');
    expect(within(form).getByLabelText('Reason')).toHaveAccessibleDescription('Said to the agent.');
    expect(within(form).getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect(within(form).getByLabelText('Notes')).toHaveValue('Go ahead');
    // choice: one option is a radio (the default ticked), required, with a free "other".
    const window = within(form).getByRole('group', { name: /Window/ });
    expect(within(window).getByRole('radio', { name: 'Tonight' })).toBeChecked();
    expect(within(window).getByRole('radio', { name: 'Tomorrow' })).not.toBeChecked();
    expect(within(window).getByLabelText('Other')).toHaveValue('');
    // multiple choice: checkboxes, the default known options ticked, the unknown one in "other".
    const regions = within(form).getByRole('group', { name: 'Regions' });
    expect(within(regions).getByRole('checkbox', { name: 'eu' })).toBeChecked();
    expect(within(regions).getByRole('checkbox', { name: 'us' })).not.toBeChecked();
    expect(within(regions).getByLabelText('Other')).toHaveValue('sa');
    // confirm, number, date.
    expect(
      within(within(form).getByRole('group', { name: 'Run the backfill' })).getByRole('radio', {
        name: 'Yes',
      }),
    ).toBeChecked();
    expect(within(form).getByLabelText('Batch size')).toHaveValue('500');
    expect(within(form).getByLabelText('Day')).toHaveValue('2026-11-20');
    // a file is filled in the session.
    expect(within(form).getByText(/This file field cannot be filled in the console/)).toBeInTheDocument();
    // Actions as buttons, with their style.
    expect(within(form).getByRole('button', { name: 'Approve' })).toHaveClass('o-btn--primary');
    expect(within(form).getByRole('button', { name: 'Not now' })).toHaveClass('o-btn--secondary');
    expect(within(form).getByRole('button', { name: 'Reject' })).toHaveClass('o-btn--danger');
  });

  it('checks the answer before it sends anything: the action’s requires, the lengths, numbers and required fields', async () => {
    const user = userEvent.setup();
    const sent = captureAnswers();
    visit(`/waits/${SHIP}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    // Approve requires the reason.
    await user.click(within(form).getByRole('button', { name: 'Approve' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Fill this in to go on.');
    expect(within(form).getByLabelText('Reason')).toBeInvalid();
    expect(within(form).getByLabelText('Reason')).toHaveAccessibleDescription(
      'Said to the agent. Fill this in to go on.',
    );
    // Typing clears the problem of that field.
    await user.click(within(form).getByLabelText('Reason'));
    await user.paste('x'.repeat(41));
    expect(within(form).queryByRole('alert')).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Approve' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Too long: 40 characters at most.');
    await user.clear(within(form).getByLabelText('Reason'));
    await user.type(within(form).getByLabelText('Reason'), 'ok');
    // A number that is not one.
    await user.clear(within(form).getByLabelText('Batch size'));
    await user.type(within(form).getByLabelText('Batch size'), 'many');
    await user.click(within(form).getByRole('button', { name: 'Approve' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Enter a number.');
    await user.clear(within(form).getByLabelText('Batch size'));
    await user.type(within(form).getByLabelText('Batch size'), '12.5');
    // The required choice, emptied.
    await user.clear(within(form).getByLabelText('Notes'));
    await user.click(
      within(within(form).getByRole('group', { name: /Window/ })).getByRole('radio', { name: 'Tomorrow' }),
    );
    await user.click(
      within(within(form).getByRole('group', { name: /Window/ })).getByRole('radio', { name: 'Tomorrow' }),
    );
    const other = within(within(form).getByRole('group', { name: /Window/ })).getByLabelText('Other');
    await user.click(other);
    await user.paste('y'.repeat(501));
    await user.click(within(form).getByRole('button', { name: 'Approve' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Too long: 500 characters at most.');
    expect(sent).toEqual([]);
  });

  it('sends the typed values of the action chosen, then shows the answer', async () => {
    const user = userEvent.setup();
    const sent = captureAnswers();
    visit(`/waits/${SHIP}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    await user.type(within(form).getByLabelText('Reason'), 'Looks right');
    const regions = within(form).getByRole('group', { name: 'Regions' });
    await user.click(within(regions).getByRole('checkbox', { name: 'us' }));
    await user.click(within(regions).getByRole('checkbox', { name: 'eu' }));
    // The free answer of a multiple choice is kept beside the ticked options.
    await user.clear(within(regions).getByLabelText('Other'));
    await user.type(within(regions).getByLabelText('Other'), 'sa');
    await user.click(
      within(within(form).getByRole('group', { name: 'Run the backfill' })).getByRole('radio', {
        name: 'No',
      }),
    );
    await user.clear(within(form).getByLabelText('Batch size'));
    await user.type(within(form).getByLabelText('Batch size'), '12.5');
    await user.click(within(form).getByRole('button', { name: 'Approve' }));

    const outcome = await screen.findByRole('region', { name: 'Answer' }, SLOW);
    expect(within(outcome).getByText(/^Approve, by you, /)).toBeInTheDocument();
    expect(within(outcome).getByText('Looks right')).toBeInTheDocument();
    expect(within(outcome).getByText('us, sa')).toBeInTheDocument();
    expect(within(outcome).getByText('false')).toBeInTheDocument();
    expect(within(outcome).getByText('12.5')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    await waitFor(() => {
      expect(sent).toEqual([
        {
          action: 'approve',
          values: {
            reason: 'Looks right',
            notes: 'Go ahead',
            window: 'Tonight',
            regions: ['us', 'sa'],
            backfill: false,
            batch: 12.5,
            on: '2026-11-20',
          },
        },
      ]);
    });
    expect(wait(1).status).toBe('resolved');
  });

  it('takes one choice, or a typed other that replaces it, as a single value', async () => {
    const user = userEvent.setup();
    const sent = captureAnswers();
    visit(`/waits/${SHIP}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    const window = within(form).getByRole('group', { name: /Window/ });
    await user.type(within(window).getByLabelText('Other'), 'Next week');
    expect(within(window).getByRole('radio', { name: 'Tonight' })).not.toBeChecked();
    await user.click(within(window).getByRole('radio', { name: 'Tomorrow' }));
    expect(within(window).getByLabelText('Other')).toHaveValue('');
    await user.click(within(form).getByRole('button', { name: 'Not now' }));
    await screen.findByRole('region', { name: 'Answer' }, SLOW);
    expect(sent[0]).toMatchObject({ action: 'later', values: { window: 'Tomorrow' } });
  });

  it('offers the single default “done” action when the wait names none', async () => {
    const user = userEvent.setup();
    const sent = captureAnswers();
    visit(`/waits/${id(2)}`);
    const second = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    await user.click(within(second).getByRole('radio', { name: 'us' }));
    await user.click(within(second).getByRole('button', { name: 'Done' }));
    await screen.findByText(/^Done, by you, /, undefined, SLOW);
    expect(sent[0]).toEqual({ action: 'done', values: { region: 'us' } });
  });

  it('says the wait is already closed when someone answered first (409), and shows it as it stands', async () => {
    const user = userEvent.setup();
    visit(`/waits/${id(2)}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    replace(2, (item) => ({
      ...item,
      status: 'cancelled',
      resolvedAt: '2026-10-30T09:00:00.000Z',
    }));
    await user.click(within(form).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Already closed', undefined, SLOW)).toBeInTheDocument();
    expect(screen.getByText(/Someone answered or cancelled this wait first/)).toBeInTheDocument();
    expect(await screen.findByText('This wait was cancelled: nobody answered it.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('shows the server’s message when it refuses the answer (400)', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/waits/:id/answer', () =>
        refused(400, 'invalid_answer', 'field region is not one of the options'),
      ),
    );
    visit(`/waits/${id(2)}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    await user.click(within(form).getByRole('button', { name: 'Done' }));
    const alert = await screen.findByRole('alert', undefined, SLOW);
    expect(alert).toHaveTextContent('Not accepted');
    expect(alert).toHaveTextContent('field region is not one of the options');
    // The form is still there to correct.
    expect(screen.getByRole('form', { name: 'Your answer' })).toBeInTheDocument();
  });

  it('says what it cannot do for any other refusal', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/waits/:id/answer', () => refused(500, 'internal', 'try again later')));
    visit(`/waits/${id(2)}`);
    await user.click(await screen.findByRole('button', { name: 'Done' }, SLOW));
    expect(await screen.findByRole('alert', undefined, SLOW)).toHaveTextContent('Not donetry again later');
  });

  it('cancels a wait after a second click, for the asker or the assignee', async () => {
    const user = userEvent.setup();
    visit(`/waits/${id(2)}`);
    await user.click(await screen.findByRole('button', { name: 'Cancel this wait' }, SLOW));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Cancel this wait' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel this wait' }));
    await user.click(screen.getByRole('button', { name: 'Cancel the wait' }));
    expect(
      await screen.findByText('This wait was cancelled: nobody answered it.', undefined, SLOW),
    ).toBeInTheDocument();
    expect(wait(2).status).toBe('cancelled');
    expect(screen.queryByRole('button', { name: 'Cancel this wait' })).toBeNull();
  });

  it('names a teammate it cannot find as such, never by their member id', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', () => refused(403, 'forbidden', 'no')));
    visit(`/waits/${SHIP}`);
    expect(await screen.findByText(/^Asked by a teammate · /, undefined, SLOW)).toBeInTheDocument();
  });

  it('keeps a login it cannot find as the server wrote it', async () => {
    server.use(http.get('*/api/v1/orgs/:org/members', () => refused(403, 'forbidden', 'no')));
    replace(3, (item) => ({ ...item, createdBy: 'lena' }));
    visit(`/waits/${id(3)}`);
    expect(await screen.findByText(/^Asked by lena · /, undefined, SLOW)).toBeInTheDocument();
  });

  it('clears an earlier refusal when the next write goes through', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/waits/:id/answer', () => refused(400, 'invalid_answer', 'not that one')));
    visit(`/waits/${id(2)}`);
    await user.click(await screen.findByRole('button', { name: 'Done' }, SLOW));
    expect(await screen.findByText('not that one', undefined, SLOW)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel this wait' }));
    await user.click(screen.getByRole('button', { name: 'Cancel the wait' }));
    expect(
      await screen.findByText('This wait was cancelled: nobody answered it.', undefined, SLOW),
    ).toBeInTheDocument();
    expect(screen.queryByText('not that one')).toBeNull();
  });

  it('does not submit the form to the page when Enter is pressed in a field', async () => {
    visit(`/waits/${id(2)}`);
    const form = await screen.findByRole('form', { name: 'Your answer' }, SLOW);
    expect(fireEvent.submit(form)).toBe(false);
  });

  it('shows a body heading below the screen’s own title, and a rule', async () => {
    visit(`/waits/${SHIP}`);
    const body = await screen.findByRole('region', { name: 'Details' }, SLOW);
    expect(within(body).getByRole('heading', { level: 4, name: 'Migration' })).toBeInTheDocument();
    expect(body.querySelector('hr')).not.toBeNull();
  });

  it('says it is closed when it was answered while the person cancelled (409)', async () => {
    const user = userEvent.setup();
    visit(`/waits/${id(2)}`);
    const cancel = await screen.findByRole('button', { name: 'Cancel this wait' }, SLOW);
    replace(2, (item) => ({ ...item, status: 'resolved', resolvedAt: '2026-10-30T09:00:00.000Z' }));
    await user.click(cancel);
    await user.click(screen.getByRole('button', { name: 'Cancel the wait' }));
    expect(await screen.findByText('Already closed', undefined, SLOW)).toBeInTheDocument();
    expect(await screen.findByText('This wait ended without an answer.')).toBeInTheDocument();
  });

  it('is read-only for a member it is not asked of, who did not ask it either', async () => {
    asMember();
    replace(3, (item) => ({ ...item, createdBy: MEMBER_IDS.samir }));
    // Not listed for them, so it is not found either.
    visit(`/waits/${id(3)}`);
    expect(await screen.findByText('wait not found', undefined, SLOW)).toBeInTheDocument();
  });

  it('does not offer the form to a member the wait is not asked of, but lets the asker cancel', async () => {
    asMember();
    visit(`/waits/${id(3)}`);
    expect(await screen.findByText(/This wait is asked of theo/, undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel this wait' })).toBeInTheDocument();
  });

  it('sends a cloud session’s own request to the session, with no form', async () => {
    visit(`/waits/${id(4)}`);
    expect(await screen.findByText(/it is answered in the session/, undefined, SLOW)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the session' })).toHaveAttribute(
      'href',
      '/sessions/ses-51c0',
    );
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('shows the answer of a resolved wait: the action chosen, who, and each value', async () => {
    visit(`/waits/${id(5)}`);
    const outcome = await screen.findByRole('region', { name: 'Answer' }, SLOW);
    expect(within(outcome).getByText(/^Rotate, by you, /)).toBeInTheDocument();
    expect(within(outcome).getByText('When')).toBeInTheDocument();
    expect(within(outcome).getByText('Friday')).toBeInTheDocument();
    expect(within(outcome).getByText('a, b')).toBeInTheDocument();
    expect(within(outcome).getByText('true')).toBeInTheDocument();
    expect(within(outcome).getByText('3')).toBeInTheDocument();
    expect(within(outcome).getByText('{"deep":1}')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('names an action the wait no longer lists, and an answer without values', async () => {
    replace(5, (item) => ({
      ...item,
      answer: { action: 'gone', author: 'someone-else', answeredAt: '2026-10-30T09:00:00.000Z' },
    }));
    visit(`/waits/${id(5)}`);
    const outcome = await screen.findByRole('region', { name: 'Answer' }, SLOW);
    expect(within(outcome).getByText(/^gone, by someone-else, /)).toBeInTheDocument();
    expect(within(outcome).queryByText('When')).toBeNull();
  });

  it('shows no link to the session when a request of a cloud session names none', async () => {
    replace(4, (item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      assignee: item.assignee,
      question: item.question,
      createdAt: item.createdAt,
    }));
    visit(`/waits/${id(4)}`);
    expect(await screen.findByText(/it is answered in the session/, undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the session' })).toBeNull();
  });

  it('shows a cancelled wait, and a wait that ended without an answer', async () => {
    visit(`/waits/${id(6)}`);
    expect(
      await screen.findByText('This wait was cancelled: nobody answered it.', undefined, SLOW),
    ).toBeInTheDocument();
    cleanup();
    visit(`/waits/${id(7)}`);
    expect(
      await screen.findByText('This wait ended without an answer.', undefined, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Asked by someone · /)).toBeInTheDocument();
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    const router = visit(`/waits/${SHIP}`);
    await user.click(await screen.findByRole('link', { name: 'Waiting for you' }, SLOW));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/waits');
    });
  });
});

describe('the navigation', () => {
  it('counts what waits for the person on the “Waiting for you” entry, and hides it without waits.v1', async () => {
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Waiting for you 3 open' }, SLOW)).toHaveAttribute(
      'href',
      '/waits',
    );
  });

  it('says 100+ when more than a page wait, and nothing when nothing does', async () => {
    db.waits = Array.from({ length: 101 }, (_, at) => ({
      ...wait(2),
      id: `00000000-0000-4000-8000-${String(at).padStart(12, '0')}`,
    }));
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(
      await within(bar).findByRole('link', { name: 'Waiting for you 100+ open' }, SLOW),
    ).toBeInTheDocument();
    cleanup();
    db.waits = [];
    visit('/');
    const empty = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(empty).findByRole('link', { name: 'Waiting for you' }, SLOW)).toBeInTheDocument();
  });

  it('does not show the entry nor the screen when the server does not serve waits', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'waits.v1'))),
      ),
    );
    visit('/waits');
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Waiting for you is not available on this server' },
        SLOW,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Waiting for you' })).toBeNull();
    expect(screen.queryByText('Nothing is waiting')).toBeNull();
  });

  it('keeps the badge off when its read is refused', async () => {
    server.use(http.get('*/api/v1/waits', () => refused(403, 'forbidden', 'no')));
    visit('/');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Waiting for you' }, SLOW)).toBeInTheDocument();
  });
});

function handleListFailing() {
  return handleListWaits(() => refused(503, 'unavailable', 'the server is busy'));
}
