// SPDX-License-Identifier: AGPL-3.0-only
import type { Approval } from '@gen/api/types.gen';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { type AppRouter, createAppRouter } from '@/app/router';
import { FRESH_SIGN_IN_MS, resetMockDb } from '@/mocks/handlers';
import { createMockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { resetArrivals } from '@/features/yes';
import { useAuthStore } from '@/shared/auth/authStore';

const { server, db } = createMockServer();
const SLOW = { timeout: 4_000 };
/** A handler that never answers, to hold a screen in its loading state. */
const never = async (): Promise<undefined> => {
  await delay('infinite');
  return undefined;
};

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test' });
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb(db);
  useAuthStore.setState({ link: undefined, notice: undefined });
  resetArrivals();
});
afterAll(() => {
  server.close();
});

function visit(path: string): AppRouter {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<App router={router} />);
  return router;
}

/** Everything optional left out: the screens must still read. */
const bare: Approval = {
  id: 'apr-bare',
  title: 'Run a script',
  requestedFrom: 'ops',
  channel: 'console',
  status: 'pending',
  shownDigest: 'sha256:bare',
};

/** Commits without their details, checks and evidence without links, a task and a decided request. */
const plain: Approval = {
  ...bare,
  id: 'apr-plain',
  title: 'Push 1 commit to main',
  commits: ['abcdef1234567'],
  checks: [
    { name: 'unit', state: 'failure' },
    { name: 'docs', state: 'skipped' },
  ],
  evidence: [{ label: 'Log', value: 'clean' }],
  taskId: 'task-9',
  askedBy: ['theo'],
};

/** Each node comes after the one before it in the page. */
function expectInOrder(nodes: readonly HTMLElement[]): void {
  nodes.slice(1).forEach((node, index) => {
    const previous = nodes[index];
    expect(previous?.compareDocumentPosition(node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
}

function addApproval(approval: Approval, approvers: readonly string[] = ['maya']): void {
  db.approvals.push(structuredClone(approval));
  db.approvers[approval.id] = approvers;
}

describe('the queue', () => {
  it('lists what waits for the viewer and what was decided, without a button in a row', async () => {
    visit('/yes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Requests' })).toBeInTheDocument();
    expect(await screen.findByText('Approving as Maya Lind (maya)')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '2 waiting for you' })).toBeInTheDocument();

    const merge = screen.getByRole('link', { name: /Merge PR #412 into main/ });
    expect(merge).toHaveAttribute('href', '/yes/apr-merge-412');
    expect(within(merge).getByText('theo asks')).toBeInTheDocument();
    expect(within(merge).getByText('Waiting for you')).toBeInTheDocument();
    expect(within(merge).getByText('acme/billing-api · 9c1e4b2')).toBeInTheDocument();
    expect(within(merge).getByText('2 commits')).toBeInTheDocument();
    expect(within(merge).getByText('2/3 checks passed')).toBeInTheDocument();
    expect(merge.querySelector('time')).toHaveAttribute('title', expect.stringMatching(/2026/));
    expect(within(merge).queryByRole('button')).toBeNull();

    const deploy = screen.getByRole('link', { name: /Deploy billing-api/ });
    expect(within(deploy).getByText('You asked')).toBeInTheDocument();
    expect(within(deploy).getByText('0/1 checks passed')).toHaveClass('ys-chip--bad');

    const decided = await screen.findByRole('link', { name: /Run migration/ });
    expect(within(decided).getByText('Approved')).toBeInTheDocument();
    expect(within(decided).getByText(/^maya · /)).toBeInTheDocument();
  });

  it('marks a request that arrives while the page is open', async () => {
    visit('/yes');
    await screen.findByRole('heading', { name: '2 waiting for you' });
    addApproval(bare);
    const card = await screen.findByRole('link', { name: /Run a script/ }, SLOW);
    expect(within(card).getByText('New')).toBeInTheDocument();
    expect(within(card).getByText('someone asks')).toBeInTheDocument();
  });

  it('reads requests that carry only what the contract requires', async () => {
    addApproval(bare);
    addApproval(plain);
    db.approvals.push({
      ...bare,
      id: 'apr-no',
      title: 'Read the logs',
      status: 'rejected',
      selfApproved: true,
    });
    visit('/yes');
    const card = await screen.findByRole('link', { name: /Run a script/ });
    expect(within(card).queryByText(/commit/)).toBeNull();
    expect(card.querySelector('time')).toBeNull();
    const push = screen.getByRole('link', { name: /Push 1 commit/ });
    expect(within(push).getByText('1 commit')).toBeInTheDocument();
    const declined = await screen.findByRole('link', { name: /Read the logs/ });
    expect(within(declined).getByText('Declined')).toBeInTheDocument();
    expect(within(declined).getByText('Self-approved')).toBeInTheDocument();
  });

  it('says when nothing waits and hides an empty decided list', async () => {
    server.use(http.get('*/api/v1/approvals', () => HttpResponse.json({ items: [] })));
    visit('/yes');
    expect(await screen.findByText('Nothing waits for you')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Decided' })).toBeNull();
  });

  it('shows the shape of the list while it loads, without a name yet', async () => {
    server.use(http.get('*/api/v1/approvals', never), http.get('*/api/v1/auth/me', never));
    visit('/yes');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText(/Approving as/)).toBeNull();
  });

  it('says the server does not answer', async () => {
    server.use(http.get('*/api/v1/approvals', () => HttpResponse.error()));
    visit('/yes');
    expect(await screen.findByText(/Ostrom does not answer/, {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });

  it('asks before a link signs in a browser where nobody is signed in: another site can open it (login CSRF)', async () => {
    db.signedIn = false;
    const router = visit('/yes#signin=opk_test_12345678');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(
      await screen.findByText(/This link signs this browser in to an Ostrom account/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with the link' })).toBeInTheDocument();
    expect(db.usedLinks).toEqual([]);
    expect(db.signedIn).toBe(false);
    // Wiped from the address before any answer: only memory holds it.
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.href).not.toContain('opk_');
  });

  it('exchanges the link for the session cookie once the person says so', async () => {
    const user = userEvent.setup();
    db.signedIn = false;
    visit('/yes#signin=opk_test_12345678');
    await user.click(await screen.findByRole('button', { name: 'Sign in with the link' }));
    await vi.waitFor(() => {
      expect(db.usedLinks).toEqual(['opk_test_12345678']);
    });
    expect(db.signedIn).toBe(true);
    expect(useAuthStore.getState().link).toBeUndefined();
  });

  it('takes a 204 with no body as nobody signed in, and still asks first', async () => {
    server.use(http.get('*/api/v1/auth/me', () => new HttpResponse(null, { status: 204 })));
    visit('/yes#signin=opk_test_12345678');
    expect(
      await screen.findByText(/This link signs this browser in to an Ostrom account/),
    ).toBeInTheDocument();
    expect(db.usedLinks).toEqual([]);
  });

  it('drops a link nobody wanted: dismissed, it is never used', async () => {
    const user = userEvent.setup();
    db.signedIn = false;
    visit('/yes#signin=opk_test_12345678');
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('button', { name: 'Sign in with the link' })).toBeNull();
    expect(useAuthStore.getState().link).toBeUndefined();
    expect(db.usedLinks).toEqual([]);
  });

  it('asks before using a link when it cannot tell whether someone is signed in', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    visit('/yes#signin=opk_test_12345678');
    expect(await screen.findByRole('button', { name: 'Sign in with the link' })).toBeInTheDocument();
    expect(db.usedLinks).toEqual([]);
  });

  it('keeps everything as it was when the sign-out fails, and says so', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/auth/logout', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    const generation = useAuthStore.getState().generation;
    visit('/yes?signout');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Could not sign out \(boom\)/)).toBeInTheDocument();
    expect(useAuthStore.getState().generation).toBe(generation);
    expect(db.signedIn).toBe(true);
  });

  it('says it signs in while the link is exchanged', async () => {
    const user = userEvent.setup();
    db.signedIn = false;
    server.use(http.post('*/api/v1/auth/link', async () => delay('infinite')));
    visit('/yes#signin=opk_test_12345678');
    await user.click(await screen.findByRole('button', { name: 'Sign in with the link' }));
    expect(await screen.findByText('Signing in with the link…')).toBeInTheDocument();
  });

  it('says a link was refused, until dismissed', async () => {
    const user = userEvent.setup();
    db.signedIn = false;
    db.usedLinks = ['opk_used_12345678'];
    visit('/yes#signin=opk_used_12345678');
    await user.click(await screen.findByRole('button', { name: 'Sign in with the link' }));
    const alert = await screen.findByText(
      /could not be used \(This link was already used or has expired\.\)/,
    );
    expect(alert).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/could not be used/)).toBeNull();
  });

  it('never takes a token from the query string, which servers log', async () => {
    const router = visit('/yes?signin=opk_test_12345678');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    expect(useAuthStore.getState().link).toBeUndefined();
    expect(db.usedLinks).toEqual([]);
    expect(router.state.location.searchStr).toBe('');
  });

  it('never ends the session from the address alone: another site can open it', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        calls += 1;
      }),
    );
    const generation = useAuthStore.getState().generation;
    visit('/yes?signout');
    expect(await screen.findByText(/Sign out of Ostrom on this browser\?/)).toBeInTheDocument();
    expect(calls).toBe(0);
    expect(db.signedIn).toBe(true);
    expect(useAuthStore.getState().generation).toBe(generation);
  });

  it('ends the session once asked, and reads everything again', async () => {
    const user = userEvent.setup();
    const generation = useAuthStore.getState().generation;
    visit('/yes?signout');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => {
      expect(useAuthStore.getState().generation).toBe(generation + 1);
    });
    expect(db.signedIn).toBe(false);
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    });
  });

  it('asks nothing of a browser nobody is signed in on', async () => {
    db.signedIn = false;
    let asked = 0;
    server.use(
      http.get('*/api/v1/auth/me', () => {
        asked += 1;
      }),
    );
    visit('/yes?signout');
    await screen.findByRole('heading', { level: 1, name: 'Requests' });
    await vi.waitFor(() => {
      expect(asked).toBeGreaterThan(0);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Sign out of Ostrom on this browser\?/)).toBeNull();
  });

  it('takes a sign-in link and the question together, and loses neither', async () => {
    const router = visit('/yes?signout#signin=opk_test_12345678');
    expect(await screen.findByText(/Sign out of Ostrom on this browser\?/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Sign in with the link' })).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
  });

  it('says it signs out while the server ends the session', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/auth/logout', async () => delay('infinite')));
    visit('/yes?signout');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Signing out…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stay signed in' })).toBeDisabled();
  });

  it('stays signed in when asked to, and the question goes with the address', async () => {
    const user = userEvent.setup();
    const router = visit('/yes?signout');
    await user.click(await screen.findByRole('button', { name: 'Stay signed in' }));
    await vi.waitFor(() => {
      expect(router.state.location.searchStr).toBe('');
    });
    expect(screen.queryByText(/Sign out of Ostrom on this browser\?/)).toBeNull();
    expect(db.signedIn).toBe(true);
  });
});

describe('a request', () => {
  it('opened by its gate’s id, as a session links it, names the request itself in the address', async () => {
    db.approvals = db.approvals.map((approval) =>
      approval.id === 'apr-merge-412' ? { ...approval, group: 'gate-merge-412' } : approval,
    );
    const router = visit('/yes/gate-merge-412');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/yes/apr-merge-412');
    });
    expect(await screen.findByRole('button', { name: 'Approve merge' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What it lets through' })).toHaveTextContent(
      'Merge into main on acme/billing-api',
    );
  });

  it('says what a yes lets through: the action, its commits, the size of the change', async () => {
    visit('/yes/apr-merge-412');
    const action = await screen.findByRole('region', { name: 'What it lets through' });
    expect(action).toHaveTextContent('Merge into main on acme/billing-api');
    expect(action).toHaveTextContent('1b2c3d4 → 9c1e4b2 · 3 files · +42 −7');
    expect(within(action).queryByText('High risk')).toBeNull();
    expect(within(action).queryByText(/too large/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve merge' })).toBeInTheDocument();
  });

  it('marks a high-risk action and a diff too large to show', async () => {
    visit('/yes/apr-deploy-88');
    const action = await screen.findByRole('region', { name: 'What it lets through' });
    expect(action).toHaveTextContent('Deploy production of acme/billing-api');
    expect(action).toHaveTextContent('a91d0e4 · 1 file · +1 −1');
    expect(within(action).getByText('High risk')).toBeInTheDocument();
    expect(within(action).getByText(/costliest to undo/)).toBeInTheDocument();
    expect(within(action).getByText(/too large to show in full/)).toBeInTheDocument();
  });

  it.each([
    ['push', 'Push to main on acme/api', 'Approve push'],
    ['tool', 'A tool call on acme/api', 'Approve tool call'],
    ['other', 'main on acme/api', 'Approve'],
  ] as const)('names a %s action and its verb, without a diff size', async (kind, line, verb) => {
    addApproval({
      ...bare,
      id: `apr-${kind}`,
      action: { kind, repo: 'acme/api', ref: 'main', headSha: 'f00dfeed00', risk: 'low' },
    });
    visit(`/yes/apr-${kind}`);
    const action = await screen.findByRole('region', { name: 'What it lets through' });
    expect(action).toHaveTextContent(line);
    expect(action).not.toHaveTextContent('file');
    expect(await screen.findByRole('button', { name: verb })).toBeInTheDocument();
  });

  it('signs in from a link to one request after a yes, wipes the token and shows that request', async () => {
    const user = userEvent.setup();
    db.signedIn = false;
    const router = visit('/yes/apr-merge-412#signin=opk_test_12345678');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Merge PR #412 into main' }),
    ).toBeInTheDocument();
    expect(router.state.location.hash).toBe('');
    expect(router.state.location.href).not.toContain('opk_');
    expect(db.usedLinks).toEqual([]);
    await user.click(await screen.findByRole('button', { name: 'Sign in with the link' }));
    await vi.waitFor(() => {
      expect(db.usedLinks).toEqual(['opk_test_12345678']);
    });
  });

  it('keeps the version the person read when the request changes, until they ask for the new one', async () => {
    const user = userEvent.setup();
    visit('/yes/apr-merge-412');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Merge PR #412 into main' }),
    ).toBeInTheDocument();
    db.approvals = db.approvals.map((item) =>
      item.id === 'apr-merge-412'
        ? { ...item, title: 'Merge PR #413 into main', shownDigest: 'sha256:new' }
        : item,
    );
    expect(await screen.findByText(/changed while you were reading it/, {}, SLOW)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Merge PR #412 into main' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show the new version' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Merge PR #413 into main' })).toBeInTheDocument();
    expect(screen.queryByText(/changed while you were reading it/)).toBeNull();
  });

  it('shows the bare commits when the server sends an empty list of details, in the list and the request', async () => {
    const user = userEvent.setup();
    addApproval({ ...bare, id: 'apr-nodetails', commits: ['abc1234def', 'fed4321cba'], commitDetails: [] });
    visit('/yes');
    const card = await screen.findByRole('link', { name: /Run a script/ });
    expect(card).toHaveTextContent('2 commits');
    await user.click(card);
    expect(await screen.findByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('fed4321')).toBeInTheDocument();
  });

  it('shows the proof in order before the buttons, then approves with the action as the verb', async () => {
    const user = userEvent.setup();
    visit('/yes/apr-merge-412');
    const title = await screen.findByRole('heading', { level: 1, name: 'Merge PR #412 into main' });
    const sections = ['Changes', 'Checks', 'Who asks', 'Why you are asked'].map((name) =>
      screen.getByRole('heading', { name }),
    );
    const approve = screen.getByRole('button', { name: /^Approve/ });
    expectInOrder([title, ...sections, approve]);
    expect(approve).toHaveAttribute('data-approval', 'approve');
    expect(screen.getByText('Waiting for you')).toHaveAttribute('data-approval', 'waiting');
    expect(screen.getByText(/Expires/).closest('time')).toHaveAttribute(
      'dateTime',
      '2026-10-30T18:00:00.000Z',
    );
    expect(screen.getByText('fix(invoices): round VAT per line')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3fa0d81' })).toHaveAttribute(
      'href',
      'https://github.com/acme/billing-api/commit/3fa0d81c55',
    );
    expect(screen.getByRole('link', { name: 'test' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '#412' })).toBeInTheDocument();
    expect(screen.getByText('Ostrom asks billing-owners to approve this.')).toBeInTheDocument();
    expect(screen.getByText('Workflow wf-backend')).toBeInTheDocument();
    expect(await screen.findByText('You approve as Maya Lind (maya).')).toBeInTheDocument();

    await user.click(approve);
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).toHaveTextContent(/maya approved: Merge PR #412 into main · /);
    await user.click(within(decision).getByText('Verify the receipt'));
    expect(within(decision).getByText('rcpt-apr-merge-412')).toBeInTheDocument();
    expect(within(decision).getByText('ed25519 · 4f2a9c1b')).toBeInTheDocument();
    expect(within(decision).getByText('ostrom verify rcpt-apr-merge-412')).toBeInTheDocument();
    expect(within(decision).getByRole('link', { name: 'Open the receipt' })).toHaveAttribute(
      'href',
      '/receipts/rcpt-apr-merge-412',
    );
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
  });

  it('says it approves while the answer is on its way', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/approvals/:id/answer', async () => delay('infinite')));
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    expect(await screen.findByRole('button', { name: 'Approving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline & tell the agent…' })).toBeDisabled();
  });

  it('refuses the asker while another approver exists, and declines with what the agent should do', async () => {
    const user = userEvent.setup();
    db.selfApproval = 'sole-approver';
    visit('/yes/apr-deploy-88');
    expect(await screen.findByText('You asked for this yourself.')).toBeInTheDocument();
    expect(screen.getByText(/If someone else can approve it, Ostrom will ask them/)).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Approve/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not allowed');
    expect(alert).toHaveTextContent('You asked for this: samir has to approve it.');
    expect(screen.queryByRole('link', { name: 'Sign in again' })).toBeNull();
    expect(screen.queryByText(/If someone else can approve it/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Decline & tell the agent…' }));
    const send = screen.getByRole('button', { name: 'Decline and send' });
    expect(send).toBeDisabled();
    await user.type(
      screen.getByRole('textbox', { name: 'What should the agent do instead?' }),
      '  Wait for samir.  ',
    );
    await user.click(send);
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).toHaveTextContent('maya declined: Deploy billing-api 2.14.0 to production');
    expect(decision).toHaveTextContent('The agent was told: “Wait for samir.”');
  });

  it('offers a fresh sign-in, back to the request, when the server wants one for the yes', async () => {
    const user = userEvent.setup();
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1;
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign in again to approve: your sign-in is more than five minutes old.');
    const again = within(alert).getByRole('link', { name: 'Sign in again' });
    const target = new URL(again.getAttribute('href') ?? '', 'https://console.invalid');
    expect(target.pathname).toBe('/signin');
    expect(target.searchParams.get('redirect')).toBe('/yes/apr-merge-412');
  });

  it('offers no sign-in for a refusal it would not change', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/approvals/:id/answer', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'Not an approver.' } }, { status: 403 }),
      ),
    );
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an approver.');
    expect(screen.queryByRole('link', { name: 'Sign in again' })).toBeNull();
  });

  it('says it declines while the refusal is on its way', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/v1/approvals/:id/answer', async () => delay('infinite')));
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: 'Decline & tell the agent…' }));
    await user.type(screen.getByRole('textbox'), 'No.');
    await user.click(screen.getByRole('button', { name: 'Decline and send' }));
    expect(await screen.findByRole('button', { name: 'Declining…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('lets the person back out of a decline', async () => {
    const user = userEvent.setup();
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: 'Decline & tell the agent…' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('records a self-approval in plain words when the asker is the only approver', async () => {
    const user = userEvent.setup();
    db.selfApproval = 'sole-approver';
    db.approvers['apr-deploy-88'] = ['maya'];
    visit('/yes/apr-deploy-88');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).toHaveTextContent('Self-approved');
    expect(decision).toHaveTextContent('maya asked for this and was the only approver: the receipt says so.');
  });

  it('reloads a request that changed since it was opened, and asks to read it again', async () => {
    const user = userEvent.setup();
    visit('/yes/apr-merge-412');
    const approve = await screen.findByRole('button', { name: /^Approve/ });
    db.approvals = db.approvals.map((item) =>
      item.id === 'apr-merge-412'
        ? { ...item, title: 'Merge PR #412 into main (rebased)', shownDigest: 'sha256:new' }
        : item,
    );
    await user.click(approve);
    expect(await screen.findByRole('alert')).toHaveTextContent('This request changed since you opened it.');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Merge PR #412 into main (rebased)' }),
    ).toBeInTheDocument();
  });

  it('says when the answer fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/approvals/:id/answer', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 }),
      ),
    );
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
    expect(screen.getByRole('alert')).toHaveTextContent('down');
  });

  it('reads a request with only what the contract requires, before the viewer is known', async () => {
    addApproval(bare);
    server.use(http.get('*/api/v1/auth/me', never));
    visit('/yes/apr-bare');
    expect(await screen.findByRole('heading', { level: 1, name: 'Run a script' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Changes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Checks' })).toBeNull();
    expect(screen.getByText('someone')).toBeInTheDocument();
    expect(screen.queryByText(/^Workflow /)).toBeNull();
    expect(screen.queryByText(/You approve as/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeInTheDocument();
    expect(screen.getByText('sha256:bare')).toBeInTheDocument();
  });

  it('reads commits without details, checks and evidence without links, and the task', async () => {
    addApproval(plain);
    visit('/yes/apr-plain');
    expect(await screen.findByText('abcdef1')).toBeInTheDocument();
    expect(screen.queryByText(/^Commit abcdef1/)).toBeNull();
    expect(screen.getByText('unit')).not.toHaveAttribute('href');
    expect(screen.getByText('skipped')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
    expect(screen.getByText('task-9')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Approve/ })).toBeInTheDocument();
  });

  it('reads evidence without any check', async () => {
    addApproval({ ...bare, id: 'apr-evidence', evidence: [{ label: 'Plan', value: 'two files' }] });
    visit('/yes/apr-evidence');
    expect(await screen.findByText('two files')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /check/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Checks' })).toBeInTheDocument();
  });

  it('shows a decided request without its receipt, from the list', async () => {
    visit('/yes/apr-migration-7');
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).toHaveTextContent('maya approved: Run migration 0042_add_credit_notes · ');
    expect(within(decision).queryByText('Verify the receipt')).toBeNull();
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });

  it('reads a declined request that names nobody and no time', async () => {
    addApproval({ ...bare, id: 'apr-declined', status: 'rejected' });
    visit('/yes/apr-declined');
    expect(await screen.findByRole('region', { name: 'Decision' })).toHaveTextContent(
      'someone declined: Run a script',
    );
    expect(screen.getByRole('region', { name: 'Decision' })).not.toHaveTextContent('·');
  });

  it.each([
    ['apr-expired', /Expired without an answer · .*2026/],
    ['apr-lapsed', /^DecisionExpired without an answer$/],
  ] as const)('reads the expired request %s', async (id, text) => {
    addApproval({ ...bare, id: 'apr-expired', status: 'expired', expiresAt: '2026-10-29T10:00:00.000Z' });
    addApproval({ ...bare, id: 'apr-lapsed', status: 'expired' });
    visit(`/yes/${id}`);
    expect(await screen.findByRole('region', { name: 'Decision' })).toHaveTextContent(text);
  });

  it('says when the request cannot be loaded', async () => {
    visit('/yes/missing');
    expect(await screen.findByText('approval not found')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the shape of the request while it loads', async () => {
    server.use(http.get('*/api/v1/approvals/:id', never));
    visit('/yes/apr-merge-412');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'All requests' })).toBeInTheDocument();
    });
  });

  it('shows the key as unknown when the signature does not name it', async () => {
    const user = userEvent.setup();
    const approved: Approval = { ...bare, id: 'apr-merge-412', status: 'approved' };
    server.use(
      http.post('*/api/v1/approvals/:id/answer', () => {
        db.approvals = db.approvals.map((item) => (item.id === approved.id ? approved : item));
        return HttpResponse.json({
          approval: approved,
          receipt: {
            id: 'rcpt-x',
            subject: { kind: 'gate', id: 'apr-merge-412', digest: 'sha256:x' },
            initiator: 'theo',
            rules: [],
            decisions: [],
            createdAt: '2026-10-30T08:00:00.000Z',
            signature: 'ed25519;sig=x',
          },
          you: { login: 'maya', self: false, canApprove: false },
        });
      }),
    );
    visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).toHaveTextContent(/someone approved: Run a script · /);
    await user.click(within(decision).getByText('Verify the receipt'));
    expect(within(decision).getByText('ed25519 · ?')).toBeInTheDocument();
  });
});

describe('safety of what the server and links bring', () => {
  it('signs in from a link only after asking, when someone is already signed in', async () => {
    const user = userEvent.setup();
    const router = visit('/yes#signin=opk_other_123456');
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Someone is already signed in on this browser');
    expect(db.usedLinks).toEqual([]);
    expect(router.state.location.hash).toBe('');
    await user.click(within(notice).getByRole('button', { name: 'Sign in with the link' }));
    await vi.waitFor(() => {
      expect(db.usedLinks).toEqual(['opk_other_123456']);
    });
    expect(screen.queryByText(/already signed in/)).toBeNull();
  });

  it('stays signed in as now when asked to, and never spends the link', async () => {
    const user = userEvent.setup();
    visit('/yes/apr-merge-412#signin=opk_other_123456');
    await user.click(await screen.findByRole('button', { name: 'Stay signed in as now' }));
    expect(screen.queryByText(/already signed in/)).toBeNull();
    expect(useAuthStore.getState().link).toBeUndefined();
    expect(db.usedLinks).toEqual([]);
  });

  it('says a sign-in link is not valid', async () => {
    const user = userEvent.setup();
    visit('/yes#signin=not%20a%20token');
    expect(await screen.findByText('This sign-in link is not valid. Ask for a new one.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/not valid/)).toBeNull();
  });

  it('says the browser is signed out instead of offline', async () => {
    server.use(
      http.get('*/api/v1/approvals', () =>
        HttpResponse.json({ error: { type: 'unauthorized', message: 'token revoked' } }, { status: 401 }),
      ),
    );
    visit('/yes');
    expect(await screen.findByText(/no longer signed in/)).toBeInTheDocument();
    expect(screen.queryByText(/does not answer/)).toBeNull();
  });

  it('says when only the decided list fails', async () => {
    server.use(
      http.get('*/api/v1/approvals', ({ request }) =>
        new URL(request.url).searchParams.has('status')
          ? HttpResponse.json({ error: { type: 'internal', message: 'boom' } }, { status: 500 })
          : HttpResponse.json({ items: [] }),
      ),
    );
    visit('/yes');
    expect(await screen.findByText(/does not answer \(boom\)/, {}, SLOW)).toBeInTheDocument();
  });

  it('says there are more waiting requests than the first page', async () => {
    server.use(http.get('*/api/v1/approvals', () => HttpResponse.json({ items: [bare], next: 'cursor-2' })));
    visit('/yes');
    expect(await screen.findByRole('heading', { name: 'More than 1 waiting for you' })).toBeInTheDocument();
  });

  it('never makes a link of a URL that is not http(s)', async () => {
    addApproval({
      ...bare,
      id: 'apr-js',
      evidence: [{ label: 'Proof', value: 'click me', url: 'javascript:alert(1)' }],
      checks: [{ name: 'ci', state: 'success', url: 'data:text/html,hi' }],
      commitDetails: [{ sha: 'abcdef1234567', title: 'x', url: 'javascript:alert(2)' }],
      commits: ['abcdef1234567'],
    });
    visit('/yes/apr-js');
    expect(await screen.findByText('click me')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'click me' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'ci' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'abcdef1' })).toBeNull();
  });

  it('starts a new page for another request: nothing of the previous answer carries over', async () => {
    const user = userEvent.setup();
    const router = visit('/yes/apr-merge-412');
    await user.click(await screen.findByRole('button', { name: /^Approve/ }));
    expect(await screen.findByRole('region', { name: 'Decision' })).toBeInTheDocument();
    await router.navigate({ to: '/yes/$approvalId', params: { approvalId: 'apr-migration-7' } });
    const decision = await screen.findByRole('region', { name: 'Decision' });
    expect(decision).not.toHaveTextContent('Merge PR #412');
    expect(within(decision).queryByText('rcpt-apr-merge-412')).toBeNull();
  });
});
