// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

function card(text: RegExp): HTMLElement {
  const found = screen.getByText(text).closest('article');
  if (found === null) throw new Error(`no rule ${String(text)}`);
  return found;
}

function viewerIs(role: 'owner' | 'member'): void {
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { login: 'maya', avatarUrl: '', role },
        capabilities: [],
      }),
    ),
  );
}

describe('the rules', () => {
  it('opens on what is left to review, grouped, with the evidence', async () => {
    visit('/rules');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rules' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'To review 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Accepted 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejected 1' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Reviews',
      'Tests',
    ]);
    const review = card(/one review from an owner/);
    expect(review).toHaveTextContent('Required');
    expect(review).toHaveTextContent('96 % sure');
    expect(review).toHaveTextContent('Why: Every merge to main');
    expect(review).toHaveTextContent('acme/billing-api · acme/web');
    expect(within(review).getByRole('link', { name: 'acme/billing-api#398' })).toHaveAttribute(
      'href',
      'https://github.com/acme/billing-api/pull/398',
    );
    expect(within(review).queryByRole('link', { name: 'CODEOWNERS' })).toBeNull();
    expect(within(review).getByText('acme/web#77')).toBeInTheDocument();
    const tests = card(/Run `pnpm test`/);
    expect(within(tests).queryByRole('list')).toBeNull();
    expect(tests).not.toHaveTextContent('Why');
  });

  it('accepts a rule, signs it, and shows who decided', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(
      within(await findCard(/one review from an owner/)).getByRole('button', { name: 'Accept' }),
    );
    expect(await screen.findByRole('button', { name: 'To review 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accepted 2' }));
    expect(card(/one review from an owner/)).toHaveTextContent(/Accepted by maya · /);
    expect(db.decisions[0]).toMatchObject({ subject: { id: 'R-12' }, action: 'accepted' });
  });

  it('rejects a rule and reopens a decided one', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(within(await findCard(/Run `pnpm test`/)).getByRole('button', { name: 'Reject' }));
    await user.click(await screen.findByRole('button', { name: 'Rejected 2' }));
    const rejected = card(/Run `pnpm test`/);
    expect(rejected).toHaveTextContent(/Rejected by maya/);
    await user.click(within(rejected).getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByRole('button', { name: 'Rejected 1' })).toBeInTheDocument();
  });

  it('fixes a rule before accepting it, and keeps the editor open until the server took it', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    const text = within(tests).getByRole('textbox', { name: 'Rule' });
    await user.clear(text);
    expect(within(tests).getByRole('button', { name: 'Save and accept' })).toBeDisabled();
    await user.type(text, 'Run the tests and the linter before pushing.');
    await user.selectOptions(within(tests).getByRole('combobox', { name: 'Strength' }), 'required');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    await user.click(await screen.findByRole('button', { name: 'Accepted 2' }));
    const fixed = card(/Run the tests and the linter/);
    expect(fixed).toHaveTextContent('Accepted with a fix');
    expect(fixed).toHaveTextContent('Required');
  });

  it('sends only the strength when the text is unchanged, and cancels an edit', async () => {
    const user = userEvent.setup();
    visit('/rules');
    const tests = await findCard(/Run `pnpm test`/);
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.selectOptions(within(tests).getByRole('combobox', { name: 'Strength' }), 'required');
    await user.click(within(tests).getByRole('button', { name: 'Save and accept' }));
    expect(await within(tests).findByText('Required')).toBeInTheDocument();
    await user.click(within(tests).getByRole('button', { name: 'Edit' }));
    await user.click(within(tests).getByRole('button', { name: 'Cancel' }));
    expect(within(tests).queryByRole('textbox')).toBeNull();
  });

  it('holds a rule while it saves', async () => {
    const user = userEvent.setup();
    server.use(http.patch('*/api/v1/rules/:id', async () => delay('infinite')));
    visit('/rules');
    const review = await findCard(/one review from an owner/);
    await user.click(within(review).getByRole('button', { name: 'Accept' }));
    expect(within(review).getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('says when a decision is refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('*/api/v1/rules/:id', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'owners only' } }, { status: 403 }),
      ),
    );
    visit('/rules');
    await user.click(
      within(await findCard(/one review from an owner/)).getByRole('button', { name: 'Accept' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('owners only');
  });

  it('accepts every sure proposal in one gesture', async () => {
    const user = userEvent.setup();
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: 'Accept the 1 rule at 90 % or more' }));
    expect(await screen.findByText('1 rule accepted.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'To review 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /at 90 % or more/ })).toBeNull();
  });

  it('says when accepting several rules failed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/rules/bulk', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    visit('/rules');
    await user.click(await screen.findByRole('button', { name: /at 90 % or more/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('disables the bulk button while it sends', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/rules/bulk', async () => delay('infinite')));
    visit('/rules');
    const bulk = await screen.findByRole('button', { name: /at 90 % or more/ });
    await user.click(bulk);
    expect(bulk).toBeDisabled();
  });

  it('shows rules without decisions to someone who does not decide', async () => {
    viewerIs('member');
    visit('/rules');
    expect(await screen.findByText(/one review from an owner/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: /at 90 % or more/ })).toBeNull();
  });

  it('gives an owner the decisions', async () => {
    viewerIs('owner');
    visit('/rules');
    expect(await screen.findAllByRole('button', { name: 'Accept' })).toHaveLength(2);
  });

  it('says when a filter is empty, for each filter', async () => {
    const user = userEvent.setup();
    server.use(http.get('*/api/v1/rules', () => HttpResponse.json({ items: [] })));
    visit('/rules');
    expect(await screen.findByText('Nothing left to review.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accepted 0' }));
    expect(screen.getByText('No rule accepted yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rejected 0' }));
    expect(screen.getByText('No rule rejected.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All 0' }));
    expect(screen.getByText(/No rule yet/)).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/rules', never));
    visit('/rules');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says why the list does not come', async () => {
    server.use(http.get('*/api/v1/rules', () => HttpResponse.error()));
    visit('/rules');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('the decisions', () => {
  it('lists every signed decision, newest first, each opening its receipt', async () => {
    visit('/decisions');
    const rows = await screen.findAllByRole('link', { name: /maya|lena/ });
    expect(rows.map((row) => row.querySelector('.o-row__title')?.textContent)).toEqual([
      'maya rejected the rule',
      'lena accepted the rule',
    ]);
    expect(rows[0]).toHaveTextContent('Commit messages are in French.');
    expect(rows[1]).toHaveTextContent('R-7');
    expect(rows[0]).toHaveAttribute('href', '/receipts/rcpt-dec-2');
  });

  it('shows a decision it has no words for as the server wrote it', async () => {
    server.use(
      http.get('*/api/v1/decisions', () =>
        HttpResponse.json({
          items: [
            {
              id: 'd',
              at: '2026-10-30T08:00:00.000Z',
              by: 'lena',
              subject: { kind: 'harness', id: 'h-1' },
              action: 'archived',
              receiptId: 'r',
            },
          ],
        }),
      ),
    );
    visit('/decisions');
    expect(await screen.findByText('lena archived the harness')).toBeInTheDocument();
  });

  it('says when there is no decision yet', async () => {
    server.use(http.get('*/api/v1/decisions', () => HttpResponse.json({ items: [] })));
    visit('/decisions');
    expect(await screen.findByText('No decision yet.')).toBeInTheDocument();
  });
});

async function findCard(text: RegExp): Promise<HTMLElement> {
  await screen.findByText(text);
  return card(text);
}
