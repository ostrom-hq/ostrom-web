// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation } from '@gen/api/types.gen';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { otherOrganization } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS } from '@/mocks/handlers';
import { DEMO_LOGIN, setDemoRole } from '@/mocks/orgs';
import { useOrgStore } from '@/shared/org/orgStore';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

/** Another page: the console of the one before goes away first. */
function revisit(path: string): void {
  cleanup();
  visit(path);
}
const SLOW = { timeout: 4_000 };

const refused = (status: number, type: string, message: string) =>
  HttpResponse.json({ error: { type, message } }, { status });

function confirmation(id: string): GovernanceConfirmation {
  const found = db.confirmations.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

function replace(id: string, change: (item: GovernanceConfirmation) => GovernanceConfirmation): void {
  db.confirmations = db.confirmations.map((item) => (item.id === id ? change(item) : item));
}

async function outcome(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Outcome' }, SLOW);
}

describe('a governance confirmation', () => {
  it('shows exactly what is asked, by whom, the change before and after, then the answer', async () => {
    visit('/confirm/gc-self-approval');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Never let the person who asks approve their own request',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    expect(screen.getByText(/^expires in 1[34]:\d\d$/)).toHaveAttribute(
      'dateTime',
      confirmation('gc-self-approval').expiresAt,
    );
    expect(
      screen.getByText('If you did not run this command yourself, refuse: an agent may have asked for it.'),
    ).toBeInTheDocument();

    const what = screen.getByRole('region', { name: 'What it changes' });
    expect(within(what).getByText('Change the self-approval policy')).toBeInTheDocument();
    expect(within(what).getByText('PUT /api/v1/gates/policy')).toBeInTheDocument();
    expect(within(what).getByText('gates:policy')).toBeInTheDocument();

    const change = screen.getByRole('region', { name: 'Before and after' });
    expect(within(change).getByText('Changes selfApproval.')).toBeInTheDocument();
    const before = within(change).getByRole('figure', { name: 'Before' });
    const after = within(change).getByRole('figure', { name: 'After' });
    expect(before.querySelector('del')).toHaveTextContent('"selfApproval": "sole-approver"');
    expect(after.querySelector('ins')).toHaveTextContent('"selfApproval": "never"');

    const who = screen.getByRole('region', { name: 'Who asks' });
    expect(within(who).getByText('Maya Lind (maya)')).toBeInTheDocument();
    expect(within(who).getByText('ostrom login --admin')).toBeInTheDocument();
    expect(within(who).getByText(/^Asked /)).toBeInTheDocument();
    expect(screen.getByText('gc-self-approval')).toBeInTheDocument();
    expect(await screen.findByText('You answer as Maya Lind (maya).')).toBeInTheDocument();
  });

  it('writes the change once confirmed, and shows what the write returned', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/confirmations/:id/answer', async () => {
        await delay(150);
        return undefined;
      }),
    );
    visit('/confirm/gc-self-approval');
    await user.click(await screen.findByRole('button', { name: 'Confirm the change' }));
    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    const done = await outcome();
    expect(within(done).getByRole('heading', { name: 'Confirmed and written' })).toBeInTheDocument();
    expect(
      within(done).getByText(/^Maya Lind \(maya\) confirmed this change on .*It is their signed decision\.$/),
    ).toBeInTheDocument();
    await user.click(within(done).getByText('What the write returned'));
    expect(within(done).getByText(/"selfApproval": "never"/)).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm the change' })).toBeNull();
    expect(screen.queryByText(/If you did not run this command yourself/)).toBeNull();
  });

  it('says it is refusing, then refused: nothing written', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/confirmations/:id/answer', async () => {
        await delay(150);
        return undefined;
      }),
    );
    visit('/confirm/gc-rule-new');
    await user.click(await screen.findByRole('button', { name: 'Refuse' }));
    expect(screen.getByRole('button', { name: 'Refusing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm the change' })).toBeDisabled();
    const done = await outcome();
    expect(within(done).getByRole('heading', { name: 'Refused' })).toBeInTheDocument();
    expect(within(done).getByText(/^Maya Lind \(maya\) refused this change on /)).toBeInTheDocument();
    expect(within(done).getByText('Nothing was written.')).toBeInTheDocument();
  });

  it('shows a creation and a deletion with nothing on one side, and a requester known only by id', async () => {
    visit('/confirm/gc-rule-new');
    const change = await screen.findByRole('region', { name: 'Before and after' });
    expect(within(change).getByText('Nothing: this change creates it.')).toBeInTheDocument();
    expect(within(change).getByRole('figure', { name: 'After' })).toHaveTextContent(
      '"statement": "Ask before a force push."',
    );
    expect(within(change).queryByText(/^Changes /)).toBeNull();
    const who = screen.getByRole('region', { name: 'Who asks' });
    expect(within(who).getByText('lena')).toBeInTheDocument();
    expect(within(who).getByText('ostrom login')).toBeInTheDocument();

    revisit('/confirm/gc-workflow-drop');
    expect(await screen.findByText('Nothing: this change deletes it.')).toBeInTheDocument();
    expect(screen.getByText('Delete a workflow')).toBeInTheDocument();
    expect(screen.getAllByText(confirmation('gc-workflow-drop').requestedBy.memberId).length).toBeGreaterThan(
      0,
    );
  });

  it('asks a sign-in of less than five minutes to confirm, back to this page, while refusing still goes', async () => {
    const user = userEvent.setup();
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1_000;
    visit('/confirm/gc-self-approval');
    await user.click(await screen.findByRole('button', { name: 'Confirm the change' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Confirming needs a sign-in of less than five minutes.');
    expect(within(alert).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/signin?redirect=%2Fconfirm%2Fgc-self-approval',
    );
    expect(screen.getByText('Waiting for you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refuse' }));
    expect(within(await outcome()).getByRole('heading', { name: 'Refused' })).toBeInTheDocument();
  });

  it('writes nothing when what it changes moved meanwhile', async () => {
    const user = userEvent.setup();
    visit('/confirm/gc-models-stale');
    await user.click(await screen.findByRole('button', { name: 'Confirm the change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'What this change replaces is no longer what it showed: nothing was written.',
    );
    const done = await outcome();
    expect(within(done).getByRole('heading', { name: 'Confirmed, but not written' })).toBeInTheDocument();
    expect(within(done).getByText('confirmation_stale')).toBeInTheDocument();
  });

  it('says the write refused the change, in the server’s words', async () => {
    const user = userEvent.setup();
    visit('/confirm/gc-rules-bulk');
    expect(await screen.findByText('Decide several rules')).toBeInTheDocument();
    // Lists are compared position by position: the rule that changes is marked whole.
    expect(screen.getByRole('figure', { name: 'Before' }).querySelectorAll('del').length).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: 'Confirm the change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ostrom refused the change when writing it: Rule R-3 changed since it was read.',
    );
    expect(within(await outcome()).getByText('Why: Rule R-3 changed since it was read.')).toBeInTheDocument();
  });

  it('says someone answered first, or that it expired, and shows how it ended', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/confirmations/:id/answer', () => {
        replace('gc-self-approval', (item) => ({ ...item, status: 'refused' }));
        return refused(409, 'confirmation_closed', 'This confirmation was already answered.');
      }),
    );
    visit('/confirm/gc-self-approval');
    await user.click(await screen.findByRole('button', { name: 'Confirm the change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone answered this confirmation first');
    // Nobody named: the answer came from elsewhere.
    expect(within(await outcome()).getByText('Someone refused this change.')).toBeInTheDocument();
  });

  it('says its time ran out on a 410', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/confirmations/:id/answer', () => {
        replace('gc-self-approval', (item) => ({ ...item, status: 'expired' }));
        return refused(410, 'confirmation_expired', 'This confirmation expired: nothing was written.');
      }),
    );
    visit('/confirm/gc-self-approval');
    await user.click(await screen.findByRole('button', { name: 'Refuse' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Its 15 minutes ran out before the answer');
    expect(
      within(await outcome()).getByRole('heading', { name: 'Expired without an answer' }),
    ).toBeInTheDocument();
  });

  it('says the server’s refusal of someone who may not answer, and an answer that did not go through', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/confirmations/:id/answer', () =>
        refused(403, 'forbidden', 'Only an owner or an admin answers a governance confirmation.'),
      ),
    );
    visit('/confirm/gc-self-approval');
    await user.click(await screen.findByRole('button', { name: 'Confirm the change' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only an owner or an admin answers a governance confirmation.',
    );
    server.use(http.post('*/api/v1/confirmations/:id/answer', () => HttpResponse.error()));
    await user.click(screen.getByRole('button', { name: 'Refuse' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The answer did not go through (The server could not be reached.). Try again.',
    );
  });

  it('offers the answer before it knows who is signed in', async () => {
    server.use(
      http.get('*/api/v1/auth/me', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/confirm/gc-self-approval');
    expect(await screen.findByRole('button', { name: 'Confirm the change' })).toBeEnabled();
    expect(screen.queryByText(/^You answer as/)).toBeNull();
  });

  it('offers no answer to a member who is neither owner nor admin', async () => {
    setDemoRole(db, 'member');
    visit('/confirm/gc-self-approval');
    expect(
      await screen.findByText(
        'Only an owner or an admin of the organization confirms or refuses a change of its governance.',
        undefined,
        SLOW,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm the change' })).toBeNull();
  });

  it('shows how an answered one ended: confirmed, refused, failed, expired', async () => {
    visit('/confirm/gc-rule-edit');
    const confirmed = await outcome();
    expect(within(confirmed).getByRole('heading', { name: 'Confirmed and written' })).toBeInTheDocument();
    expect(screen.queryByText(/^expires in/)).toBeNull();

    revisit('/confirm/gc-workflow-new');
    expect(await screen.findByText(/^Maya Lind \(maya\) refused this change on /)).toBeInTheDocument();

    revisit('/confirm/gc-workflow-save');
    expect(await screen.findByText('Why: The workflow changed since version 3.')).toBeInTheDocument();

    revisit('/confirm/gc-rule-gone');
    expect(
      await screen.findByText('Nobody answered within 15 minutes. Run the command again to ask anew.'),
    ).toBeInTheDocument();
  });

  it('reads an ending the server left bare: no one named, no time, no reason, no result', async () => {
    replace('gc-workflow-save', (item) => {
      const bare = { ...item };
      delete bare.answeredBy;
      delete bare.answeredAt;
      delete bare.error;
      return bare;
    });
    replace('gc-rule-edit', (item) => ({ ...item, result: null }));
    visit('/confirm/gc-workflow-save');
    const failed = await outcome();
    expect(within(failed).getByText('Someone confirmed this change.')).toBeInTheDocument();
    expect(within(failed).getByText('Why: Ostrom did not say.')).toBeInTheDocument();
    revisit('/confirm/gc-rule-edit');
    expect(await screen.findAllByText(/It is their signed decision/)).not.toHaveLength(0);
    expect(screen.queryByText('What the write returned')).toBeNull();
  });

  it('expires on screen when its time runs out while it is open', async () => {
    replace('gc-self-approval', (item) => ({
      ...item,
      expiresAt: new Date(Date.now() + 1_200).toISOString(),
    }));
    visit('/confirm/gc-self-approval');
    expect(await screen.findByText(/^expires in 0:0[12]$/)).toBeInTheDocument();
    expect(
      within(await outcome()).getByRole('heading', { name: 'Expired without an answer' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm the change' })).toBeNull();
  });

  it('keeps the answer open while the server says it waits, whatever this device’s clock says', async () => {
    const late = {
      ...confirmation('gc-self-approval'),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    server.use(http.get('*/api/v1/confirmations/:id', () => HttpResponse.json(late)));
    visit('/confirm/gc-self-approval');
    expect(await screen.findByText('expires in 0:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm the change' })).toBeEnabled();
    expect(screen.queryByRole('region', { name: 'Outcome' })).toBeNull();
  });

  it('says a confirmation of another organization, or none, is not found', async () => {
    visit('/confirm/gc-none');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirmation not found' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/switch organization in the top bar/)).toBeInTheDocument();
  });

  it('never shows another organization’s confirmation', async () => {
    const globex = otherOrganization();
    db.otherOrganizations = [globex];
    const named: (string | null)[] = [];
    traffic.onRequest((request) => {
      if (new URL(request.url).pathname === '/api/v1/confirmations/gc-self-approval')
        named.push(request.headers.get('ostrom-org'));
    });
    act(() => {
      useOrgStore.getState().choose(globex.id, DEMO_LOGIN);
    });
    visit('/confirm/gc-self-approval');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Confirmation not found' }, SLOW),
    ).toBeInTheDocument();
    expect(named).toContain(globex.id);
    expect(screen.queryByText('Never let the person who asks approve their own request')).toBeNull();
  });

  it('asks to sign in, back to this page, when nobody is signed in', async () => {
    server.use(
      http.get('*/api/v1/confirmations/:id', () => refused(401, 'unauthorized', 'nobody is signed in')),
    );
    visit('/confirm/gc-self-approval');
    const alert = await screen.findByText('Sign in to read this confirmation.');
    expect(
      within(alert.closest('[role="alert"]') ?? alert).getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/signin?redirect=%2Fconfirm%2Fgc-self-approval');
  });

  it('shows its shape while it loads, and the server’s failure when it does not come', async () => {
    server.use(
      http.get('*/api/v1/confirmations/:id', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/confirm/gc-self-approval');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the server’s failure when the confirmation does not come', async () => {
    server.use(http.get('*/api/v1/confirmations/:id', () => refused(500, 'internal', 'database down')));
    visit('/confirm/gc-self-approval');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('database down');
    }, SLOW);
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });
});
