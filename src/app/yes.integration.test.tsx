import type { Ask } from '@gen/api/types.gen';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/shared/i18n/i18n';
import { App } from '@/app/App';
import { type AppRouter, createAppRouter } from '@/app/router';
import { initialAsks } from '@/mocks/fixtures/yes';
import { createMockServer } from '@/mocks/node';
import { configureApiClient } from '@/shared/api/apiClient';
import { useAuthStore } from '@/shared/auth/authStore';

const { server, db } = createMockServer();
const SLOW = { timeout: 4_000 };

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  configureApiClient({ baseUrl: 'http://ostrom.test/api', getToken: () => useAuthStore.getState().token });
});
afterEach(() => {
  server.resetHandlers();
  db.asks = initialAsks();
});
afterAll(() => {
  server.close();
});

function open(path: string): AppRouter {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(<App router={router} />);
  return router;
}

function ask(id: string): Ask {
  const found = db.asks.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

function withoutGate(item: Ask): Ask {
  const copy = structuredClone(item);
  delete copy.gate;
  return copy;
}

function withoutReceipt(item: Ask): Ask {
  const copy = structuredClone(item);
  delete copy.receipt;
  return copy;
}

/** Everything optional left out: the screens must still read. */
const bare: Ask = {
  id: 'ask-bare',
  status: 'pending',
  title: 'Run a script',
  channel: 'console',
  who: {},
  what: { harness: 'pkg-1' },
  gate: { label: 'Scripts', approvers: ['maya'] },
  rules: [{ id: 'R-1', statement: 'Scripts are reviewed.' }],
  commits: [],
  evidence: [{ label: 'Log', value: 'clean' }],
  shownDigest: 'sha256:bare',
  askedBy: ['theo'],
  pr: { number: '7', sha: 'abcdef1234' },
};

const rich: Ask = {
  ...bare,
  id: 'ask-rich',
  title: 'Refactor',
  what: { action: 'Push a branch', command: 'git push', repo: 'acme/web', sessionRepo: 'acme/api' },
  gate: { label: 'Push', approvers: ['maya', 'samir'] },
  rules: Array.from({ length: 8 }, (_, index) => ({
    id: `R-${String(index)}`,
    statement: `Rule ${String(index)}`,
    strength: index % 2 === 0 ? ('required' as const) : ('recommended' as const),
  })),
  diff: '--- a/x\n+++ b/x\n@@ -1 +1 @@\n\n-old\n+new',
  askedBy: ['samir'],
};

describe('the queue', () => {
  it('lists what waits, who it is signed as, and what was decided', async () => {
    open('/yes');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Waiting for your yes' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('signed as maya · approver account')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 waiting' })).toBeInTheDocument();

    const merge = screen.getByRole('link', { name: /Merge a pull request/ });
    expect(merge).toHaveAttribute('href', '/yes/ask-merge-412');
    expect(within(merge).getByText('waiting for you')).toBeInTheDocument();
    expect(within(merge).getByText('+0 −0')).toBeInTheDocument();
    expect(within(merge).getByText('#412 @ 9c1e4b2')).toBeInTheDocument();
    expect(within(merge).getByText(/via Claude Code/)).toBeInTheDocument();

    const deploy = screen.getByRole('link', { name: /Deploy/ });
    expect(within(deploy).getByText('you asked')).toBeInTheDocument();

    const decided = screen.getByRole('link', { name: /Database migration/ });
    expect(within(decided).getByText('yes')).toBeInTheDocument();
  });

  it('marks a request that arrives while the page is open', async () => {
    open('/yes');
    await screen.findByRole('heading', { name: '2 waiting' });
    db.asks.push(structuredClone(bare));
    const card = await screen.findByRole('link', { name: /Run a script/ }, SLOW);
    expect(within(card).getByText('new')).toBeInTheDocument();
  });

  it('reads a bare request and a refused one', async () => {
    server.use(
      http.get('*/api/yes/queue', () =>
        HttpResponse.json({
          operator: 'ops',
          pending: [bare, { ...withoutGate(bare), id: 'ask-nogate', title: 'Read the logs' }],
          recent: [{ ...bare, id: 'ask-no', status: 'rejected', selfApproved: true }],
        }),
      ),
    );
    open('/yes');
    expect(await screen.findByText('signed as ops')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Run a script/ })).toHaveTextContent('someone via an agent');
    expect(screen.getByRole('link', { name: /Read the logs/ })).not.toHaveTextContent('gate');
    expect(screen.getByRole('link', { name: /self-approved/ })).toHaveTextContent(/^no/);
  });

  it('says when nothing waits', async () => {
    server.use(
      http.get('*/api/yes/queue', () => HttpResponse.json({ operator: 'ops', pending: [], recent: [] })),
    );
    open('/yes');
    expect(await screen.findByText('Nothing waits for you')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Decided' })).toBeNull();
  });

  it('shows a loading state, then the server failure', async () => {
    server.use(http.get('*/api/yes/queue', () => new Promise<never>(() => undefined)));
    open('/yes');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
  });

  it('says the server does not answer', async () => {
    server.use(http.get('*/api/yes/queue', () => HttpResponse.error()));
    open('/yes');
    expect(await screen.findByText(/Ostrom does not answer/, undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('signing in from a link', () => {
  it('keeps the token and drops it from the address', async () => {
    const router = open('/yes?signin=opk_test_12345678');
    await screen.findByRole('heading', { level: 1, name: 'Waiting for your yes' });
    expect(useAuthStore.getState().token).toBe('opk_test_12345678');
    expect(router.state.location.searchStr).toBe('');
  });

  it('forgets the token on signout', async () => {
    useAuthStore.getState().signIn('opk_test_12345678');
    const router = open('/yes?signout');
    await screen.findByRole('heading', { level: 1, name: 'Waiting for your yes' });
    expect(useAuthStore.getState().token).toBeUndefined();
    expect(router.state.location.searchStr).toBe('');
  });
});

describe('a request', () => {
  it('shows who, what, why, the diff and the evidence, then signs the yes', async () => {
    const user = userEvent.setup();
    open('/yes/ask-merge-412');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Merge a pull request' }),
    ).toBeInTheDocument();
    expect(screen.getByText('waiting for you')).toBeInTheDocument();
    expect(screen.getByText('in acme/billing-api')).toBeInTheDocument();
    expect(screen.getByText(/through Claude Code \(claude-opus-5-5\) session ses-7f3a/)).toBeInTheDocument();
    expect(screen.queryByText(/Asked by/)).toBeNull();
    expect(screen.getByText('acme/billing-api · PR #412 at 9c1e4b2')).toBeInTheDocument();
    expect(screen.getByText('gh pr merge 412 --squash')).toBeInTheDocument();
    expect(screen.getByText('under package pkg-2026.10.30-3')).toBeInTheDocument();
    expect(screen.getByText('9c1e4b2')).toBeInTheDocument();
    expect(
      screen.getByText(/The gate Merge to main of the workflow Ship a backend change/),
    ).toHaveTextContent('needs a yes from maya, samir.');
    expect(screen.getByRole('link', { name: 'green (12 checks)' })).toHaveAttribute('target', '_blank');
    expect(await screen.findByText('Your yes is signed as maya.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, run it' }));
    const receipt = await screen.findByRole('region', { name: 'Signed receipt' });
    expect(within(receipt).getByText(/^Yes from maya/)).toBeInTheDocument();
    expect(within(receipt).getByText('signature valid')).toBeInTheDocument();
    expect(within(receipt).getByRole('link', { name: 'Download the receipt' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/api\/receipts\/.+\/bundle$/),
    );
    expect(screen.queryByRole('button', { name: 'Yes, run it' })).toBeNull();
  });

  it('refuses the author while another approver exists, and lets the no through', async () => {
    const user = userEvent.setup();
    open('/yes/ask-deploy-88');
    expect(
      await screen.findByText('You asked for this action: samir has to approve it.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, run it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused by Ostrom');
    expect(screen.queryByText('You asked for this action: samir has to approve it.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'No' }));
    const receipt = await screen.findByRole('region', { name: 'Signed receipt' });
    expect(within(receipt).getByText(/^No from maya/)).toBeInTheDocument();
  });

  it('warns the only approver that their yes is self-approved', async () => {
    const deploy = ask('ask-deploy-88');
    deploy.gate = { label: 'Production deploy', approvers: ['maya'] };
    deploy.you = { login: 'maya', self: true, canApprove: true, selfApproval: true };
    open('/yes/ask-deploy-88');
    expect(await screen.findByText(/your yes will be marked self-approved/)).toBeInTheDocument();
  });

  it('says when the decision fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/yes/:id/decide', () => HttpResponse.json({ error: 'down' }, { status: 500 })),
    );
    open('/yes/ask-merge-412');
    await user.click(await screen.findByRole('button', { name: 'Yes, run it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('error');
  });

  it('reads a bare request without a signer', async () => {
    server.use(http.get('*/api/yes/queue', () => new Promise<never>(() => undefined)));
    db.asks.push(structuredClone(bare));
    open('/yes/ask-bare');
    expect(await screen.findByRole('heading', { level: 1, name: 'Run a script' })).toBeInTheDocument();
    expect(screen.getByText(/through an agent/)).toBeInTheDocument();
    expect(screen.getByText('Scripts are reviewed.')).toBeInTheDocument();
    expect(screen.getByText('The gate Scripts needs a yes from maya.')).toBeInTheDocument();
    expect(screen.getByText('PR #7 at abcdef1')).toBeInTheDocument();
    expect(screen.getByText('under package pkg-1')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
    expect(screen.queryByText(/Your yes is signed as/)).toBeNull();
  });

  it('warns about another repository, caps the rules and colours the diff', async () => {
    db.asks.push(structuredClone(rich));
    open('/yes/ask-rich');
    expect(
      await screen.findByText(/opened for acme\/api, but the command runs in acme\/web/),
    ).toBeInTheDocument();
    expect(screen.getByText('and 2 more decided rules')).toBeInTheDocument();
    expect(screen.getByText('(not samir: asked for it)')).toBeInTheDocument();
    expect(screen.getByText(/^Asked by samir/)).toBeInTheDocument();
    expect(screen.getByText('+new')).toHaveClass('ys-diff__line--added');
    expect(screen.getByText('-old')).toHaveClass('ys-diff__line--removed');
  });

  it('says when the request cannot be loaded', async () => {
    open('/yes/missing');
    expect(await screen.findByText(/HTTP 404|not found/i, undefined, SLOW)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a decided request with its receipt instead of the buttons', async () => {
    open('/yes/ask-migration-7');
    const receipt = await screen.findByRole('region', { name: 'Signed receipt' });
    expect(within(receipt).getByText(/^Yes from maya/)).toBeInTheDocument();
    expect(within(receipt).getByText('ed25519 · 4f2a9c1b')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.queryByText('Why it stopped')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yes, run it' })).toBeNull();
  });

  it('shows the loading state', async () => {
    server.use(http.get('*/api/yes/:id', () => new Promise<never>(() => undefined)));
    open('/yes/ask-merge-412');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading');
  });
});

describe('a receipt', () => {
  const decided: Ask = {
    ...bare,
    id: 'ask-done',
    status: 'rejected',
    receipt: {
      id: 'rcpt-1',
      kind: 'gate',
      signature: 'ed25519;sha256=00',
      createdAt: '2026-10-30T08:00:00.000Z',
      valid: false,
      digest: 'sha256:0000',
      result: 'rejected',
      selfApproved: true,
    },
  };

  it('reads an invalid, unsigned-by-name receipt', async () => {
    db.asks.push(structuredClone(decided));
    open('/yes/ask-done');
    const receipt = await screen.findByRole('region', { name: 'Signed receipt' });
    expect(within(receipt).getByText('NOT valid')).toBeInTheDocument();
    expect(within(receipt).getByText(/^No from someone/)).toBeInTheDocument();
    expect(within(receipt).getByText('ed25519 · ?')).toBeInTheDocument();
    expect(within(receipt).getByText(/is the only approver of the gate/)).toBeInTheDocument();
    expect(screen.getByText('refused')).toBeInTheDocument();
  });

  it('falls back to the decider when the receipt names nobody', async () => {
    db.asks.push({
      ...structuredClone(decided),
      id: 'ask-by',
      decidedBy: 'samir',
      decidedAt: '2026-10-30T08:01:00.000Z',
    });
    open('/yes/ask-by');
    expect(await screen.findByText(/^No from samir/)).toBeInTheDocument();
  });

  it('shows a receipt being signed', async () => {
    db.asks.push({ ...withoutReceipt(decided), id: 'ask-unsigned', status: 'expired' });
    open('/yes/ask-unsigned');
    expect(await screen.findByText('Signing the receipt…')).toBeInTheDocument();
    expect(screen.getByText('expired')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull();
    });
  });
});
