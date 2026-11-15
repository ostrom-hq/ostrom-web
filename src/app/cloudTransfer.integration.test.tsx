// SPDX-License-Identifier: Apache-2.0
import type { CloudTransfer } from '@gen/api/types.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function row(text: string | RegExp): HTMLElement {
  const found = within(screen.getByRole('region', { name: 'Sessions' }))
    .getByText(text)
    .closest('li');
  if (found === null) throw new Error(`no row ${String(text)}`);
  return found;
}

function offer(): CloudTransfer {
  const [first] = db.cloudTransfers;
  if (first === undefined) throw new Error('no transfer');
  return first;
}

function asMember(login: string, id: string): void {
  db.members = db.members.map((member) => (member.login === login ? { ...member, role: 'member' } : member));
  db.orgMembers[db.organization.id] = (db.orgMembers[db.organization.id] ?? []).map((member) =>
    member.login === login ? { ...member, role: 'member' } : member,
  );
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login, verified: true, via: 'github' },
        member: { id, login, avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

describe('the transfer of a cloud session', () => {
  it('gives a session at once when an administrator asks, and says it is moving', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(within(mine).queryByRole('option', { name: 'maya (administrator)' })).toBeNull();
    await user.selectOptions(within(mine).getByRole('combobox', { name: 'Give the session to' }), 'theo');
    await user.click(within(mine).getByRole('checkbox', { name: /Resume the session/ }));
    await user.click(within(mine).getByRole('button', { name: 'Give the session' }));
    await within(await screen.findByRole('region', { name: 'Transfers' })).findByText('Moving');
    expect(db.cloudTransfers[0]).toMatchObject({
      toMemberId: MEMBER_IDS.theo,
      state: 'accepted',
      resume: true,
    });
    expect(await within(row('Fix the flaky invoice test')).findByText('Transferring')).toBeInTheDocument();
    expect(within(row('Fix the flaky invoice test')).queryByRole('button', { name: 'Transfer…' })).toBeNull();
  }, 15_000);

  it('lets a member offer a session, and withdraw the offer', async () => {
    const user = userEvent.setup();
    asMember('maya', MEMBER_IDS.maya);
    db.cloudTransfers = [];
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(within(mine).getByText(/They accept within 7 days/)).toBeInTheDocument();
    await user.selectOptions(within(mine).getByRole('combobox', { name: 'Give the session to' }), 'samir');
    await user.click(within(mine).getByRole('button', { name: 'Offer the session' }));
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(await within(transfers).findByText('Offered')).toBeInTheDocument();
    expect(transfers).toHaveTextContent('offer lapses');
    await user.click(within(transfers).getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(transfers).getByRole('button', { name: 'Cancel the transfer of Fix the flaky invoice test' }),
    );
    expect(await within(transfers).findByText('Cancelled')).toBeInTheDocument();
  }, 15_000);

  it('keeps the form closed on Keep it, and asks for a member first', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(within(mine).getByRole('button', { name: 'Give the session' })).toBeDisabled();
    await user.click(within(mine).getByRole('button', { name: 'Keep it' }));
    expect(within(mine).getByRole('button', { name: 'Transfer…' })).toBeInTheDocument();
  });

  it('says when no other member can take the session', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/cloud/transfer-recipients', () =>
        HttpResponse.json({ recipients: [{ id: MEMBER_IDS.maya, login: 'maya', administrator: true }] }),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(await within(mine).findByText('No other member can take this session.')).toBeInTheDocument();
  });

  it('says why the members cannot be listed, in the server\u2019s words or ours', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/cloud/transfer-recipients', () =>
        HttpResponse.json({ error: { type: 'transfer_disabled', message: 'off' } }, { status: 403 }),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(await within(mine).findByText(/does not allow members to transfer/)).toBeInTheDocument();
    expect(within(mine).queryByText('No other member can take this session.')).toBeNull();
  });

  it('shows the server\u2019s message when the members cannot be listed for another reason', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/cloud/transfer-recipients', () =>
        HttpResponse.json(
          { error: { type: 'internal_error', message: 'Members are out of reach.' } },
          { status: 500 },
        ),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(await within(mine).findByText('Members are out of reach.')).toBeInTheDocument();
  });

  it('lets the recipient accept an offer, or decline it', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(transfers).toHaveTextContent('theo to maya');
    expect(transfers).toHaveTextContent('resumes for the recipient');
    await user.click(within(transfers).getByRole('button', { name: 'Accept' }));
    expect(await within(transfers).findByText('Moving')).toBeInTheDocument();
    expect(within(transfers).queryByRole('button', { name: 'Accept' })).toBeNull();
    // The recipient does not withdraw a transfer made to them: they decline an offer.
    expect(within(transfers).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('declines an offer', async () => {
    const user = userEvent.setup();
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    await user.click(within(transfers).getByRole('button', { name: 'Decline' }));
    expect(await within(transfers).findByText('Declined')).toBeInTheDocument();
  });

  it('lets a manager withdraw an offer another member made', async () => {
    const user = userEvent.setup();
    db.cloudTransfers = db.cloudTransfers.map((item) => ({ ...item, toMemberId: MEMBER_IDS.samir }));
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(within(transfers).queryByRole('button', { name: 'Accept' })).toBeNull();
    await user.click(within(transfers).getByRole('button', { name: 'Cancel' }));
    await user.click(within(transfers).getByRole('button', { name: /Cancel the transfer of/ }));
    expect(await within(transfers).findByText('Cancelled')).toBeInTheDocument();
  });

  it('gives a member no button on an accepted transfer they did not ask', async () => {
    asMember('maya', MEMBER_IDS.maya);
    db.cloudTransfers = db.cloudTransfers.map((item) => ({
      ...item,
      state: 'accepted',
      toMemberId: MEMBER_IDS.samir,
    }));
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(within(transfers).queryByRole('button')).toBeNull();
  });

  it('shows a failed transfer with its reason and a state it has no words for as is', async () => {
    db.cloudTransfers = [
      {
        ...offer(),
        state: 'failed',
        failure: {
          code: 'transfer_timeout',
          message: 'The session did not pause in time.',
          retryable: false,
        },
      },
      { ...offer(), id: 'tr-9', state: 'parked', resume: false },
    ];
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(within(transfers).getByText('Failed')).toBeInTheDocument();
    expect(transfers).toHaveTextContent('The session did not pause in time.');
    expect(within(transfers).getByText('parked')).toBeInTheDocument();
  });

  it('says a refusal in its own words, and any other as the server wrote it', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/transfer', () =>
        HttpResponse.json(
          { error: { type: 'transfer_pending', message: 'The session already has an open transfer.' } },
          { status: 409 },
        ),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    await user.selectOptions(within(mine).getByRole('combobox', { name: 'Give the session to' }), 'theo');
    await user.click(within(mine).getByRole('button', { name: 'Give the session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This session already has an open transfer.');
    server.use(
      http.post('*/api/v1/cloud/transfers/:id/accept', () =>
        HttpResponse.json({ error: { type: 'other', message: 'Not today.' } }, { status: 409 }),
      ),
    );
    await user.click(
      within(screen.getByRole('region', { name: 'Transfers' })).getByRole('button', { name: 'Accept' }),
    );
    expect(await screen.findByText('Not today.')).toBeInTheDocument();
  });

  it('holds the buttons while the server has not answered', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/transfer', async () => {
        await delay('infinite');
        return new HttpResponse(null);
      }),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    await user.selectOptions(within(mine).getByRole('combobox', { name: 'Give the session to' }), 'theo');
    await user.click(within(mine).getByRole('button', { name: 'Give the session' }));
    expect(await within(mine).findByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(within(mine).getByRole('combobox', { name: 'Give the session to' })).toBeDisabled();
  });

  it('names an administrator among the members to pick', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/cloud/transfer-recipients', () =>
        HttpResponse.json({ recipients: [{ id: MEMBER_IDS.lena, login: 'lena', administrator: true }] }),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    expect(await within(mine).findByRole('option', { name: 'lena (administrator)' })).toBeInTheDocument();
  });

  it('holds the answer buttons of a transfer while the server has not answered', async () => {
    const user = userEvent.setup();
    const never = async (): Promise<Response> => {
      await delay('infinite');
      return new HttpResponse(null);
    };
    server.use(
      http.post('*/api/v1/cloud/transfers/:id/accept', never),
      http.post('*/api/v1/cloud/transfers/:id/decline', never),
      http.post('*/api/v1/cloud/transfers/:id/cancel', never),
    );
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    await user.click(within(transfers).getByRole('button', { name: 'Accept' }));
    expect(await within(transfers).findByRole('button', { name: 'Decline' })).toBeDisabled();
  });

  it('holds a decline, then a withdrawal, the same way', async () => {
    const user = userEvent.setup();
    const never = async (): Promise<Response> => {
      await delay('infinite');
      return new HttpResponse(null);
    };
    server.use(http.post('*/api/v1/cloud/transfers/:id/decline', never));
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    await user.click(within(transfers).getByRole('button', { name: 'Decline' }));
    expect(await within(transfers).findByRole('button', { name: 'Accept' })).toBeDisabled();
  });

  it('holds a withdrawal while the server has not answered', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/cloud/transfers/:id/cancel', async () => {
        await delay('infinite');
        return new HttpResponse(null);
      }),
    );
    db.cloudTransfers = db.cloudTransfers.map((item) => ({ ...item, toMemberId: MEMBER_IDS.samir }));
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    await user.click(within(transfers).getByRole('button', { name: 'Cancel' }));
    await user.click(within(transfers).getByRole('button', { name: /Cancel the transfer of/ }));
    expect(await within(transfers).findByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('keeps its key when the server fails, and takes a new one after a refusal', async () => {
    const user = userEvent.setup();
    const keys: (string | null)[] = [];
    let answers = 0;
    server.use(
      http.post('*/api/v1/cloud/sessions/:id/transfer', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        answers += 1;
        return HttpResponse.json(
          { error: { type: answers === 1 ? 'internal' : 'transfer_pending', message: 'No.' } },
          { status: answers === 1 ? 500 : 409 },
        );
      }),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    const mine = row('Fix the flaky invoice test');
    await user.click(within(mine).getByRole('button', { name: 'Transfer…' }));
    await user.selectOptions(within(mine).getByRole('combobox', { name: 'Give the session to' }), 'theo');
    await user.click(within(mine).getByRole('button', { name: 'Give the session' }));
    await screen.findByRole('alert');
    await user.click(within(mine).getByRole('button', { name: 'Give the session' }));
    await waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[1]).toBe(keys[0]);
  });

  it('reads the transfers before the sessions, and shows them by their session id', async () => {
    server.use(
      http.get('*/api/v1/cloud/sessions', async () => {
        await delay('infinite');
        return new HttpResponse(null);
      }),
    );
    visit('/cloud');
    const transfers = await screen.findByRole('region', { name: 'Transfers' });
    expect(transfers).toHaveTextContent('cs-27');
  });

  it('shows nothing of transfers on a server that does not serve them', async () => {
    server.use(
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'runners.cloud.transfer.v1')),
        ),
      ),
    );
    visit('/cloud');
    await screen.findByText('Fix the flaky invoice test');
    expect(screen.queryByRole('button', { name: 'Transfer…' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Transfers' })).toBeNull();
  });
});
