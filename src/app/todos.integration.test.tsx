// SPDX-License-Identifier: AGPL-3.0-only
import { handleCapabilities } from '@gen/api/msw.gen';
import type { Todo } from '@gen/api/types.gen';
import { focusManager } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-30T08:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

/** The paths the console asks for from now on. */
function watch(): string[] {
  const paths: string[] = [];
  traffic.onRequest((request) => {
    paths.push(new URL(request.url).pathname);
  });
  return paths;
}

function withoutTodos(): void {
  server.use(
    handleCapabilities(() =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'todos.v1'))),
    ),
  );
}

function demoTodo(): Todo {
  const todo = db.todos['ses-7f3a'];
  if (todo === undefined) throw new Error('the demo has no todo');
  return todo;
}

describe('the Todo view of a session', () => {
  it('shows a counter pill that opens the plan, the items and the hook errors', async () => {
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    const pill = await screen.findByRole('button', { name: 'Todo: 2 of 5 done. Show the list.' });
    expect(pill).toHaveTextContent('2 / 5');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Todo' })).toBeNull();

    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const view = screen.getByRole('region', { name: 'Todo' });
    expect(within(view).getByText(/Move billing-api to the new invoice schema/)).toBeInTheDocument();
    expect(within(view).getByLabelText('2 of 5 done')).toHaveTextContent('2 / 5');
    expect(within(view).getByText('Now: Read from the new schema')).toBeInTheDocument();
    // The item that was dropped is no part of the plan's count.
    expect(within(view).getByText('Remove the legacy table')).toBeInTheDocument();

    const rows = within(view)
      .getAllByRole('listitem')
      .filter((row) => row.querySelector('.o-row__title') !== null);
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'Write the migration',
      'Write both schemas',
      'Read from the new schema',
      'Backfill the old invoices',
      'Remove the legacy table',
      'Ship the release',
    ]);
    expect(rows.map((row) => row.querySelector('.o-badge')?.textContent)).toEqual([
      'Done',
      'Done',
      'In progress',
      'To do',
      'Dropped',
      'Drop requested',
    ]);
    const first = rows[0];
    expect(first).toHaveTextContent('Done when: Write the migration is merged and the pipeline is green');
    expect(first).toHaveTextContent('Pull request merged in acme/billing-api');
    expect(first).toHaveTextContent('CI green in acme/billing-api');
    expect(first).toHaveTextContent(/Last proof, .*2026.*: pull request merged: acme\/billing-api#412/);
    expect(first).not.toHaveTextContent('Added along the way');
    const along = rows[1];
    expect(along).toHaveTextContent('Added along the way');
    expect(along).toHaveTextContent('Not verified');
    expect(along).toHaveTextContent('On the agent’s word: the agent saw both tables fill');
    expect(rows[2]).toHaveTextContent(/Last proof, .*: the pull request is not merged yet/);
    expect(rows[3]).not.toHaveTextContent('Last proof');

    // Only what the Stop hook failed at is listed; a blocked stop is a wait of its own.
    expect(within(view).getByRole('heading', { name: 'Stop hook errors' })).toBeInTheDocument();
    expect(within(view).getByText('The relay did not answer in time')).toBeInTheDocument();
    expect(within(view).queryByText('Blocked: 2 items open')).toBeNull();
    // Two of five on the agent's word is not yet a warning.
    expect(within(view).queryByText(/rest on the agent’s word alone/)).toBeNull();

    await user.click(pill);
    expect(screen.queryByRole('region', { name: 'Todo' })).toBeNull();
  });

  it('warns when more than a third of the items rest on the agent’s word, and says a list is finished', async () => {
    const todo = demoTodo();
    db.todos['ses-7f3a'] = {
      ...todo,
      status: 'done',
      hookEvents: [],
      items: todo.items.map((item) => ({ ...item, status: 'done', unverified: true })),
    };
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    await user.click(await screen.findByRole('button', { name: /^Todo: 6 of 6 done/ }));
    const view = screen.getByRole('region', { name: 'Todo' });
    expect(
      within(view).getByText('More than a third of the points rest on the agent’s word alone.'),
    ).toBeVisible();
    expect(within(view).getByText('Finished')).toBeInTheDocument();
    expect(within(view).queryByText(/^Now:/)).toBeNull();
    expect(within(view).queryByText('Stop hook errors')).toBeNull();
  });

  it('says an abandoned list, and reads one with none of the optional fields', async () => {
    db.todos['ses-7f3a'] = {
      id: 't',
      sessionId: 'ses-7f3a',
      reference: 'Only the plan',
      status: 'abandoned',
      items: [],
      createdAt: '2026-10-30T07:00:00.000Z',
      updatedAt: '2026-10-30T07:00:00.000Z',
    };
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    await user.click(await screen.findByRole('button', { name: 'Todo: 0 of 0 done. Show the list.' }));
    const view = screen.getByRole('region', { name: 'Todo' });
    expect(within(view).getByText('Abandoned')).toBeInTheDocument();
    expect(within(view).getByLabelText('0 of 0 done')).toBeInTheDocument();
  });

  it('is read again when the person comes back to the tab', async () => {
    const user = userEvent.setup();
    visit('/sessions/ses-7f3a');
    await user.click(await screen.findByRole('button', { name: /^Todo: 2 of 5 done/ }));
    expect(screen.queryByText('Wire the alerts')).toBeNull();
    const todo = demoTodo();
    db.todos['ses-7f3a'] = {
      ...todo,
      items: [
        ...todo.items,
        {
          ...todo.items[0],
          id: 'alerts',
          name: 'Wire the alerts',
          status: 'todo',
          origin: 'discovered',
        } as Todo['items'][number],
      ],
    };
    vi.setSystemTime(new Date('2026-10-30T08:00:20.000Z'));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    expect(await screen.findByText('Wire the alerts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todo: 2 of 6 done. Show the list.' })).toBeInTheDocument();
  });

  it('shows nothing for a session without a todo', async () => {
    const paths = watch();
    visit('/sessions/ses-51c0');
    expect(await screen.findByRole('heading', { level: 1, name: 'codex · acme/billing-api' })).toBeVisible();
    await waitFor(() => {
      expect(paths.some((path) => path === '/api/v1/todos/session')).toBe(true);
    });
    expect(screen.queryByRole('button', { name: /^Todo/ })).toBeNull();
  });

  it('is hidden, and never asked, where the server does not serve todos', async () => {
    withoutTodos();
    const paths = watch();
    visit('/sessions/ses-7f3a');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'claude-code · acme/billing-api' }),
    ).toBeVisible();
    expect(await screen.findByText('Started by theo')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Todo/ })).toBeNull();
    expect(paths.some((path) => path.startsWith('/api/v1/todos'))).toBe(false);
  });

  it('is hidden when the server fails to answer, the session page still shows', async () => {
    server.use(
      http.get('*/api/v1/todos/session', () =>
        HttpResponse.json({ error: { type: 'not_found', message: 'no such route' } }, { status: 404 }),
      ),
    );
    visit('/sessions/ses-7f3a');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'claude-code · acme/billing-api' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Todo/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Who and where' })).toBeVisible();
  });

  it('shows the list of an ended session too, without asking again', async () => {
    db.todos['ses-2b9e'] = { ...demoTodo(), sessionId: 'ses-2b9e' };
    visit('/sessions/ses-2b9e');
    expect(await screen.findByRole('button', { name: /^Todo: 2 of 5 done/ })).toBeVisible();
  });
});

describe('the Todo Stop hook switch of a member', () => {
  function switchOf(name: string): HTMLElement {
    return screen.getByRole('checkbox', { name: `Todo Stop hook for ${name}` });
  }

  it('is on for everyone until an administrator turns it off, and stays off', async () => {
    const user = userEvent.setup();
    visit('/members');
    await screen.findByText('Samir Haddad');
    await waitFor(() => {
      expect(switchOf('Samir Haddad')).toBeChecked();
    });
    expect(screen.getAllByLabelText('Todo Stop hook')).toHaveLength(5);
    await user.click(switchOf('Samir Haddad'));
    await waitFor(() => {
      expect(switchOf('Samir Haddad')).not.toBeChecked();
    });
    expect(db.stopHookOff).toEqual([MEMBER_IDS.samir]);
    expect(switchOf('theo')).toBeChecked();

    await user.click(switchOf('Samir Haddad'));
    await waitFor(() => {
      expect(switchOf('Samir Haddad')).toBeChecked();
    });
    expect(db.stopHookOff).toEqual([]);
  });

  it('shows what the hook does, for a screen reader', async () => {
    visit('/members');
    await screen.findByText('Samir Haddad');
    await waitFor(() => {
      expect(switchOf('Samir Haddad')).toBeChecked();
    });
    expect(switchOf('Samir Haddad')).toHaveAccessibleDescription(
      /cannot end its turn while its todo has open items/,
    );
  });

  it('says why it could not be saved, and keeps its state', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/todos/stop-hook/members/:memberId', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'Not for you.' } }, { status: 403 }),
      ),
    );
    visit('/members');
    await screen.findByText('Samir Haddad');
    await waitFor(() => {
      expect(switchOf('Samir Haddad')).toBeChecked();
    });
    await user.click(switchOf('Samir Haddad'));
    expect(await screen.findByText('Not for you.')).toBeInTheDocument();
    expect(switchOf('Samir Haddad')).toBeChecked();
  });

  it('is not offered to a member who is not an administrator', async () => {
    setDemoRole(db, 'member');
    const paths = watch();
    visit('/members');
    await screen.findByText('Samir Haddad');
    expect(screen.queryByLabelText('Todo Stop hook')).toBeNull();
    expect(paths.some((path) => path.startsWith('/api/v1/todos/stop-hook'))).toBe(false);
  });

  it('is hidden where the server does not serve todos', async () => {
    withoutTodos();
    const paths = watch();
    visit('/members');
    await screen.findByText('Samir Haddad');
    expect(screen.queryByLabelText('Todo Stop hook')).toBeNull();
    expect(paths.some((path) => path.startsWith('/api/v1/todos/stop-hook'))).toBe(false);
  });

  it('is hidden when the list of hooks cannot be read', async () => {
    server.use(
      http.get('*/api/v1/todos/stop-hook', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'no' } }, { status: 403 }),
      ),
    );
    const paths = watch();
    visit('/members');
    await screen.findByText('Samir Haddad');
    await waitFor(() => {
      expect(paths.some((path) => path.startsWith('/api/v1/todos/stop-hook'))).toBe(true);
    });
    expect(screen.queryByLabelText('Todo Stop hook')).toBeNull();
  });
});
