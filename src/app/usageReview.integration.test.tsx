// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { FRESH_SIGN_IN_MS } from '@/mocks/handlers';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', name: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string): Promise<HTMLElement> {
  const form = await screen.findByRole('region', { name: 'Reconcile usage' });
  await user.type(within(form).getByRole('textbox', { name: 'Verified total ($)' }), amount);
  await user.selectOptions(
    within(form).getByRole('combobox', { name: 'Evidence source' }),
    'PROVIDER_RECORD',
  );
  await user.type(within(form).getByRole('textbox', { name: 'Evidence reference' }), 'usage export');
  await user.type(within(form).getByRole('textbox', { name: 'Reason' }), 'stream cut');
  return form;
}

describe('the usage review', () => {
  it('lists the pending requests, then one member’s, then the history', async () => {
    const user = userEvent.setup();
    visit('/usage');
    const pending = await screen.findByRole('region', { name: 'Pending requests' });
    expect(await within(pending).findByRole('link', { name: 'call_7f3a9c' })).toHaveAttribute(
      'href',
      '/usage/call_7f3a9c',
    );
    expect(within(pending).getByText('$1.25')).toBeInTheDocument();
    expect(within(pending).getByText('$0.4805')).toBeInTheDocument();
    expect(within(pending).getByText('Provider request req_011CXa')).toBeInTheDocument();
    expect(within(pending).getByText('Provider request not captured')).toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'Member' });
    await within(picker).findByRole('option', { name: 'samir' });
    await user.selectOptions(picker, 'samir');
    expect(await within(pending).findByRole('link', { name: 'call_51b2e0' })).toBeInTheDocument();
    expect(within(pending).queryByRole('link', { name: 'call_7f3a9c' })).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Reconciliation history' }));
    const history = await screen.findByRole('region', { name: 'Reconciliation history' });
    expect(await within(history).findByText('No correction yet.')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Member' }), '');
    expect(await within(history).findByText('$2.00 → $0.31')).toBeInTheDocument();
    expect(within(history).getByText(/Reconciled .* by lena · theo/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Pending requests' }));
    expect(await screen.findByRole('region', { name: 'Pending requests' })).toBeInTheDocument();
  });

  it('reads older records on request, and says when nothing is pending', async () => {
    const user = userEvent.setup();
    db.pendingUsage = Array.from({ length: 51 }, (_, index) => ({
      id: `c${String(index)}`,
      member: 'theo',
      micros: 1,
      heldAt: '2026-11-14T16:02:00Z',
      leaseExpiredAt: '2026-11-14T16:12:00Z',
    }));
    visit('/usage?member=' + MEMBER_IDS.theo);
    expect(await screen.findByRole('combobox', { name: 'Member' })).toHaveValue(MEMBER_IDS.theo);
    const pending = await screen.findByRole('region', { name: 'Pending requests' });
    await within(pending).findByRole('link', { name: 'c0' });
    expect(within(pending).getAllByRole('listitem')).toHaveLength(50);
    await user.click(within(pending).getByRole('button', { name: 'Older records' }));
    expect(await within(pending).findByRole('link', { name: 'c50' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Reconciliation history' }));
    db.pendingUsage = [];
    await user.click(screen.getByRole('link', { name: 'Pending requests' }));
    expect(await screen.findByText('No request needs review.')).toBeInTheDocument();
  });

  it('reconciles a pending request with the charge shown, then shows the correction', async () => {
    const user = userEvent.setup();
    visit('/usage/call_51b2e0');
    expect(await screen.findByText('req_011CXa')).toBeInTheDocument();
    const form = await fill(user, '0.2');
    await user.click(within(form).getByRole('button', { name: 'Reconcile usage' }));
    const done = await screen.findByRole('region', { name: 'Correction' });
    expect(within(done).getByText('$0.4805 → $0.20')).toBeInTheDocument();
    expect(within(done).getByText('Provider usage record · usage export')).toBeInTheDocument();
    expect(within(done).getByText(/Reconciled .* by maya/)).toBeInTheDocument();
    expect(db.usageReconciliations[0]).toMatchObject({ id: 'call_51b2e0', micros: 200_000 });
    expect(db.pendingUsage.map((item) => item.id)).toEqual(['call_7f3a9c']);
  });

  it('shows a correction whose provider request was not captured', async () => {
    visit('/usage/call_2c4d6e');
    const done = await screen.findByRole('region', { name: 'Correction' });
    expect(within(done).getByText('not captured')).toBeInTheDocument();
    expect(
      within(done).getByText('The original attribution and this correction are kept.'),
    ).toBeInTheDocument();
  });

  it('shows a correction with its workflow, launch and an evidence source it does not know', async () => {
    db.usageReconciliations = [
      {
        ...(db.usageReconciliations[0] ?? {
          id: '',
          member: '',
          heldAt: '',
          previousMicros: 0,
          micros: 0,
          source: '',
          reference: '',
          reason: '',
          reconciledBy: '',
          reconciledAt: '',
        }),
        workflowId: 'wf_1',
        launchId: 'la_1',
        providerRequestId: 'req_9',
        source: 'PROVIDER_INVOICE',
      },
    ];
    visit('/usage/call_2c4d6e');
    const done = await screen.findByRole('region', { name: 'Correction' });
    expect(within(done).getByText('wf_1')).toBeInTheDocument();
    expect(within(done).getByText('la_1')).toBeInTheDocument();
    expect(within(done).getByText('req_9')).toBeInTheDocument();
    expect(within(done).getByText('PROVIDER_INVOICE · console usage export 2026-11-12')).toBeInTheDocument();
  });

  it('shows a pending request’s workflow and launch, and holds the form while the server takes it', async () => {
    const user = userEvent.setup();
    db.pendingUsage = [
      {
        ...(db.pendingUsage[0] ?? { id: '', member: '', micros: 0, heldAt: '', leaseExpiredAt: '' }),
        launchId: 'la_2',
      },
    ];
    server.use(
      http.post('*/api/v1/usage/reservations/:id/reconcile', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/usage/call_7f3a9c');
    expect(await screen.findByText('wf_release')).toBeInTheDocument();
    expect(screen.getByText('la_2')).toBeInTheDocument();
    const form = await screen.findByRole('region', { name: 'Reconcile usage' });
    expect(within(form).getByRole('button', { name: 'Reconcile usage' })).toBeDisabled();
    const element = form.querySelector('form');
    if (element !== null) fireEvent.submit(element);
    await fill(user, '1');
    await user.click(within(form).getByRole('button', { name: 'Reconcile usage' }));
    expect(await within(form).findByRole('button', { name: 'Reconciling…' })).toBeDisabled();
  });

  it('asks for a fresh sign-in, and says a stale view must be reviewed again', async () => {
    const user = userEvent.setup();
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1_000;
    visit('/usage/call_7f3a9c');
    let form = await fill(user, '1');
    await user.click(within(form).getByRole('button', { name: 'Reconcile usage' }));
    const said = await within(form).findByRole('alert');
    expect(said).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(within(said).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      `/signin?redirect=${encodeURIComponent('/usage/call_7f3a9c')}`,
    );
    db.signedInAt = Date.now();
    // Another administrator's correction landed meanwhile: the hold now reads as corrected.
    server.use(
      http.post('*/api/v1/usage/reservations/:id/reconcile', () =>
        HttpResponse.json({ error: { type: 'reconciled', message: 'already reconciled' } }, { status: 409 }),
      ),
    );
    form = screen.getByRole('region', { name: 'Reconcile usage' });
    await user.click(within(form).getByRole('button', { name: 'Reconcile usage' }));
    expect(await within(form).findByText('already reconciled')).toBeInTheDocument();
  }, 15_000);

  it('keeps a member asked for by the address who is not among the people read', async () => {
    visit('/usage?member=gone-member');
    const picker = await screen.findByRole('combobox', { name: 'Member' });
    expect(picker).toHaveValue('gone-member');
    expect(await screen.findByText('No request needs review.')).toBeInTheDocument();
  });

  it('says when there is nothing under review with this id', async () => {
    visit('/usage/nope');
    expect(await screen.findByText('Nothing to review here')).toBeInTheDocument();
  });

  it('says so too when the server answers neither a hold nor a correction', async () => {
    server.use(http.get('*/api/v1/usage/reservations/:id', () => HttpResponse.json({})));
    visit('/usage/empty');
    expect(await screen.findByText('Nothing to review here')).toBeInTheDocument();
  });

  it.each([
    ['/usage', '*/api/v1/usage/pending'],
    ['/usage/call_7f3a9c', '*/api/v1/usage/reservations/:id'],
  ])('says why %s could not be read', async (path, route) => {
    server.use(
      http.get(route, () =>
        HttpResponse.json({ error: { type: 'internal', message: 'usage is down' } }, { status: 500 }),
      ),
    );
    visit(path);
    expect(await screen.findByText('usage is down')).toBeInTheDocument();
  });

  it.each(['/usage', '/usage/call_7f3a9c'])(
    'tells a member that %s is for owners and admins',
    async (path) => {
      asMember();
      visit(path);
      expect(
        await screen.findByText('Only the organization’s owners and admins review unknown usage.'),
      ).toBeInTheDocument();
    },
  );

  it.each([
    ['/usage', '*/api/v1/usage/pending'],
    ['/usage/call_7f3a9c', '*/api/v1/usage/reservations/:id'],
  ])(
    'says %s is for owners and admins when the server refuses an administrator anyway',
    async (path, route) => {
      server.use(
        http.get(route, () =>
          HttpResponse.json({ error: { type: 'forbidden', message: 'no' } }, { status: 403 }),
        ),
      );
      visit(path);
      expect(await screen.findByText('Owners and admins only')).toBeInTheDocument();
    },
  );

  it('is not offered by a server without capacity.usagereconciliation.v1', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'capacity.usagereconciliation.v1')),
        ),
      ),
    );
    visit('/usage');
    expect(
      await screen.findByRole('heading', { name: 'Usage review is not available on this server' }),
    ).toBeVisible();
  });
});
