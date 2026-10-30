// SPDX-License-Identifier: AGPL-3.0-only
import type { Receipt } from '@gen/api/types.gen';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupMockApp, TEST_API, visit } from '@/test/mockApp';

const { server } = setupMockApp();
const never = (): Promise<never> => new Promise<never>(() => undefined);

const bare: Receipt = {
  id: 'rcpt-bare',
  subject: { kind: 'task', id: 'task-1', digest: 'sha256:aa' },
  initiator: 'lena',
  rules: [],
  decisions: [
    { approvalId: 'apr-9', by: 'samir', at: '2026-10-29T10:00:00.000Z', result: 'rejected', selfApproved: true },
  ],
  nodes: [],
  createdAt: '2026-10-29T10:00:01.000Z',
  signature: 'ed25519;kid=4f2a9c1b;sha256=aa;sig=x',
};

function serve(receipt: Receipt): void {
  server.use(http.get('*/api/v1/receipts/:id', () => HttpResponse.json(receipt)));
}

describe('the receipts list', () => {
  it('lists every receipt with what it is about, who started it and when', async () => {
    visit('/receipts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Receipts' })).toBeInTheDocument();
    const gate = await screen.findByRole('link', { name: /apr-migration-7/ });
    expect(gate).toHaveAttribute('href', '/receipts/rcpt-apr-migration-7');
    expect(within(gate).getByText('Request')).toBeInTheDocument();
    expect(within(gate).getByText('by samir · 1 decision')).toBeInTheDocument();
    expect(gate.querySelector('time')).toHaveAttribute('title', expect.stringMatching(/2026/));
    const session = screen.getByRole('link', { name: /ses-2b9e/ });
    expect(within(session).getByText('by samir · 0 decisions')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /wf-backend/ })).getByText('Workflow')).toBeInTheDocument();
  });

  it('says when there is no receipt yet', async () => {
    server.use(http.get('*/api/v1/receipts', () => HttpResponse.json({ items: [] })));
    visit('/receipts');
    expect(await screen.findByText('No receipts yet')).toBeInTheDocument();
  });

  it('shows the shape of the list while it loads', async () => {
    server.use(http.get('*/api/v1/receipts', never));
    visit('/receipts');
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('says the server does not answer', async () => {
    server.use(http.get('*/api/v1/receipts', () => HttpResponse.error()));
    visit('/receipts');
    expect(await screen.findByText('Offline', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('a receipt', () => {
  it('shows the server check, what it records, the rules, the steps and how to verify it offline', async () => {
    visit('/receipts/rcpt-ses-2b9e');
    expect(await screen.findByRole('heading', { level: 1, name: 'Session ses-2b9e' })).toBeInTheDocument();
    expect(screen.getByText(/^Signed .*2026/)).toBeInTheDocument();

    const signature = screen.getByRole('region', { name: 'Signature' });
    expect(await within(signature).findByText('Signature verified')).toBeInTheDocument();
    expect(signature).toHaveTextContent('with key 4f2a9c1b of this instance');
    expect(signature).toHaveTextContent('Keyed25519 · 4f2a9c1b');

    const records = screen.getByRole('region', { name: 'What it records' });
    expect(records).toHaveTextContent('Started bysamir');
    expect(records).toHaveTextContent('Modelclaude-sonnet-5');
    expect(records).toHaveTextContent('Package0.4.1 · sha256:9e1d77c0');
    expect(records).toHaveTextContent('Model cost$1.07');
    expect(screen.getByRole('region', { name: 'Rules in force' })).toHaveTextContent('R-3sha256:33ccR-12sha256:11aa');
    const steps = screen.getByRole('region', { name: 'Workflow steps' });
    expect(steps).toHaveTextContent('Tests passpassed');
    expect(steps).toHaveTextContent('Merge to mainNo mergeskipped');
    expect(screen.queryByRole('region', { name: 'Decisions' })).toBeNull();

    const yourself = screen.getByRole('region', { name: 'Verify it yourself' });
    expect(yourself).toHaveTextContent('ostrom verify rcpt-ses-2b9e');
    const download = within(yourself).getByRole('link', { name: 'Download the bundle' });
    expect(download).toHaveAttribute('href', `${TEST_API}/api/v1/receipts/rcpt-ses-2b9e/bundle`);
    expect(download).toHaveAttribute('download', 'rcpt-ses-2b9e.json');
  });

  it('lists the decisions of a request and links each to its request', async () => {
    visit('/receipts/rcpt-apr-migration-7');
    const decisions = await screen.findByRole('region', { name: 'Decisions' });
    expect(within(decisions).getByText('Approved')).toBeInTheDocument();
    expect(within(decisions).getByRole('link', { name: 'apr-migration-7' })).toHaveAttribute(
      'href',
      '/yes/apr-migration-7',
    );
    expect(decisions).toHaveTextContent(/maya · .*2026/);
    expect(screen.queryByRole('region', { name: 'Workflow steps' })).toBeNull();
    expect(screen.getByRole('region', { name: 'What it records' })).not.toHaveTextContent('Package');
  });

  it('says loudly when a receipt does not verify', async () => {
    visit('/receipts/rcpt-tampered');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Does not verify');
    expect(alert).toHaveTextContent('the signature does not match any key of this instance');
    expect(screen.getByRole('region', { name: 'Signature' })).toHaveTextContent('Keyed25519 · ?');
    expect(screen.getByRole('region', { name: 'What it records' })).not.toHaveTextContent('Agent');
    expect(screen.queryByRole('region', { name: 'Rules in force' })).toBeNull();
  });

  it('reads a declined, self-approved decision and an empty list of steps', async () => {
    serve(bare);
    visit('/receipts/rcpt-bare');
    const decisions = await screen.findByRole('region', { name: 'Decisions' });
    expect(within(decisions).getByText('Declined')).toBeInTheDocument();
    expect(within(decisions).getByText('Self-approved')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workflow steps' })).toBeNull();
  });

  it('shows the shape of the check while it runs', async () => {
    serve(bare);
    server.use(http.get('*/api/v1/receipts/:id/verify', never));
    visit('/receipts/rcpt-bare');
    const signature = await screen.findByRole('region', { name: 'Signature' });
    expect(within(signature).getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows a verified answer without a key id', async () => {
    serve(bare);
    server.use(http.get('*/api/v1/receipts/:id/verify', () => HttpResponse.json({ ok: true })));
    visit('/receipts/rcpt-bare');
    const signature = await screen.findByRole('region', { name: 'Signature' });
    expect(await within(signature).findByText('Signature verified')).toBeInTheDocument();
    expect(signature).not.toHaveTextContent('with key');
  });

  it('says why the check could not run', async () => {
    serve(bare);
    server.use(
      http.get('*/api/v1/receipts/:id/verify', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'keys unavailable' } }, { status: 500 }),
      ),
    );
    visit('/receipts/rcpt-bare');
    expect(await screen.findByText('keys unavailable', {}, { timeout: 4_000 })).toBeInTheDocument();
  });

  it('says when the receipt does not exist', async () => {
    visit('/receipts/nope');
    expect(await screen.findByText('receipt not found', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});
