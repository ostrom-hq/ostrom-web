// SPDX-License-Identifier: AGPL-3.0-only
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function rows(): HTMLElement[] {
  return within(within(screen.getByRole('main')).getByRole('list')).getAllByRole('listitem');
}

describe('the audit log', () => {
  it('is in the menu, and lists who changed what, newest first, with the facts the server gives', async () => {
    const user = userEvent.setup();
    visit('/');
    await user.click(await screen.findByRole('link', { name: 'Audit log' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
    expect(await screen.findByText('budget.changed')).toBeInTheDocument();
    const lines = rows();
    expect(lines).toHaveLength(5);
    expect(lines[0]).toHaveTextContent(/^budget\.changedtheo · budget:organization · .*2026/);
    expect(lines[0]).toHaveTextContent('monthlyUsd: 500 · credential: browser');
    expect(lines[4]).toHaveTextContent('member.joinedsamir · member:samir');
  });

  it('shows the older lines on demand, then offers no more', async () => {
    const user = userEvent.setup();
    visit('/audit');
    await screen.findByText('budget.changed');
    await user.click(screen.getByRole('button', { name: 'Show older lines' }));
    expect(await screen.findByText('org.created')).toBeInTheDocument();
    expect(rows()).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Show older lines' })).toBeNull();
  });

  /** One line and the promise of more; `older` answers the next page. */
  const paged = (older: () => Promise<Response | undefined> | Response): void => {
    server.use(
      http.get('*/api/v1/audit', ({ request }) =>
        new URL(request.url).searchParams.has('before')
          ? older()
          : HttpResponse.json({
              items: [
                {
                  id: 'a1',
                  at: '2026-10-30T07:00:00.000Z',
                  event: 'org.renamed',
                  actor: 'lena',
                  subject: 'org:acme',
                },
              ],
              next: 'a1',
            }),
      ),
    );
  };

  it('says the next page is loading', async () => {
    paged(async () => {
      await delay('infinite');
      return undefined;
    });
    visit('/audit');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show older lines' }));
    expect(await screen.findByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('says why the next page did not come, and what was read stays', async () => {
    paged(() => HttpResponse.json({ error: { type: 'internal', message: 'older down' } }, { status: 500 }));
    visit('/audit');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Show older lines' }));
    expect(await screen.findByText('older down')).toBeInTheDocument();
    expect(screen.getByText('org.renamed')).toBeInTheDocument();
  });

  it('tells someone who is not an owner or an admin that the log is theirs, and nothing else', async () => {
    db.members = db.members.map((member) =>
      member.login === 'maya' ? { ...member, role: 'member' } : member,
    );
    visit('/audit');
    expect(
      await screen.findByText('Only an owner or an admin of the organization reads its audit log.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('says when the server does not serve the log', async () => {
    server.use(
      http.get('*/api/v1/audit', () =>
        HttpResponse.json({ error: { type: 'not_found', message: 'Not found' } }, { status: 404 }),
      ),
    );
    visit('/audit');
    expect(await screen.findByText('This server does not serve the audit log yet.')).toBeInTheDocument();
  });

  it('says why the log did not come', async () => {
    server.use(
      http.get('*/api/v1/audit', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'audit down' } }, { status: 500 }),
      ),
    );
    visit('/audit');
    expect(await screen.findByText('audit down')).toBeInTheDocument();
  });

  it('says when nothing has changed yet', async () => {
    server.use(http.get('*/api/v1/audit', () => HttpResponse.json({ items: [] })));
    visit('/audit');
    expect(await screen.findByText('Nothing has changed in the organization yet.')).toBeInTheDocument();
  });
});
