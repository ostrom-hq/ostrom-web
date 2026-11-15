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

const { server, db, traffic } = setupMockApp();

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Temporary daily budgets' });
}

async function choose(box: HTMLElement, login: string): Promise<void> {
  const user = userEvent.setup();
  const picker = within(box).getByRole('combobox', { name: 'Member' });
  await within(picker).findByRole('option', { name: login });
  await user.selectOptions(picker, login);
}

const ended = (id: string, extra: object = {}) => ({
  id,
  member: 'theo',
  micros: 10_000_000,
  createdAt: '2026-11-14T09:00:00Z',
  expiresAt: '2026-11-14T10:00:00Z',
  reason: 'yesterday',
  createdBy: 'lena',
  ...extra,
});

describe('the temporary daily budgets', () => {
  it('grants one to a member, replaces it, then revokes it', async () => {
    const user = userEvent.setup();
    visit('/spend');
    const box = await section();
    await choose(box, 'theo');
    expect(await within(box).findByText('No temporary budget for theo yet.')).toBeInTheDocument();
    const grant = within(box).getByRole('form', { name: 'Grant the temporary budget' });
    const submit = within(grant).getByRole('button', { name: 'Grant the temporary budget' });
    expect(submit).toBeDisabled();
    await user.type(within(grant).getByRole('textbox', { name: 'Total today ($)' }), '25');
    const minutes = within(grant).getByRole('spinbutton', { name: 'For (minutes)' });
    expect(minutes).toHaveValue(60);
    await user.clear(minutes);
    await user.type(minutes, '90');
    await user.type(within(grant).getByRole('textbox', { name: 'Reason (no secrets)' }), 'release day');
    await user.click(submit);
    const history = await within(box).findByRole('list', { name: 'Grants and revocations' });
    expect(await within(history).findByText('$25.00 today')).toBeInTheDocument();
    expect(within(history).getByText('In force')).toBeInTheDocument();
    expect(db.budgetOverrides).toHaveLength(1);
    expect(db.budgetOverrides[0]).toMatchObject({ micros: 25_000_000, reason: 'release day' });
    const first = db.budgetOverrides[0]?.id ?? '';

    // The one in force is replaced, never added to: the form names it and prefills its allowance.
    const replace = await within(box).findByRole('form', { name: 'Replace the temporary budget' });
    const amount = within(replace).getByRole('textbox', { name: 'Total today ($)' });
    expect(amount).toHaveValue('25');
    await user.clear(amount);
    await user.type(amount, '40');
    await user.type(within(replace).getByRole('textbox', { name: 'Reason (no secrets)' }), 'more');
    await user.click(within(replace).getByRole('button', { name: 'Replace the temporary budget' }));
    expect(await within(box).findByText('$40.00 today')).toBeInTheDocument();
    expect(within(box).getByText(`Replaces ${first}`)).toBeInTheDocument();
    expect(within(box).getByText('Ended')).toBeInTheDocument();

    const revoke = within(box).getByRole('form', { name: 'Revoke' });
    const revokeButton = within(revoke).getByRole('button', { name: 'Revoke' });
    expect(revokeButton).toBeDisabled();
    await user.type(within(revoke).getByRole('textbox', { name: 'Revocation reason' }), 'done');
    await user.click(revokeButton);
    expect(await within(box).findByText('Revoked')).toBeInTheDocument();
    expect(within(box).getByText(/Revoked .* by maya · done/)).toBeInTheDocument();
    expect(within(box).getByRole('form', { name: 'Grant the temporary budget' })).toBeInTheDocument();
  }, 20_000);

  it('asks for a fresh sign-in before a grant or a revocation', async () => {
    const user = userEvent.setup();
    db.budgetOverrides = [ended('o1', { expiresAt: '2999-01-01T00:00:00Z' })];
    db.signedInAt = Date.now() - FRESH_SIGN_IN_MS - 1_000;
    visit('/spend');
    const box = await section();
    await choose(box, 'theo');
    const replace = await within(box).findByRole('form', { name: 'Replace the temporary budget' });
    await user.type(within(replace).getByRole('textbox', { name: 'Reason (no secrets)' }), 'more');
    await user.click(within(replace).getByRole('button', { name: 'Replace the temporary budget' }));
    const said = await within(replace).findByRole('alert');
    expect(said).toHaveTextContent('This change needs a sign-in less than five minutes old.');
    expect(within(said).getByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      `/signin?redirect=${encodeURIComponent('/spend')}`,
    );
    const revoke = within(box).getByRole('form', { name: 'Revoke' });
    await user.type(within(revoke).getByRole('textbox', { name: 'Revocation reason' }), 'stop');
    await user.click(within(revoke).getByRole('button', { name: 'Revoke' }));
    expect(
      await within(box).findAllByText('This change needs a sign-in less than five minutes old.'),
    ).toHaveLength(2);
    expect(db.budgetOverrides[0]?.revokedAt).toBeUndefined();
  });

  it('reads older grants on request, and says what another member has', async () => {
    const user = userEvent.setup();
    db.budgetOverrides = Array.from({ length: 51 }, (_, index) =>
      ended(`o${String(index)}`, { micros: (index + 1) * 1_000_000 }),
    );
    // A revocation the server names nobody for, without a reason.
    db.budgetOverrides[50] = ended('o50', { micros: 51_000_000, revokedAt: '2026-11-14T09:30:00Z' });
    visit('/spend');
    const box = await section();
    await choose(box, 'theo');
    const history = await within(box).findByRole('list', { name: 'Grants and revocations' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(50);
    await user.click(within(box).getByRole('button', { name: 'Older grants' }));
    expect(await within(history).findByText('$1.00 today')).toBeInTheDocument();
    expect(within(history).getByText('Revoked')).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: 'Older grants' })).toBeNull();
    await choose(box, 'samir');
    expect(await within(box).findByText('No temporary budget for samir yet.')).toBeInTheDocument();
  });

  it('sends nothing incomplete, and holds the form while the server takes a grant', async () => {
    const user = userEvent.setup();
    db.budgetOverrides = [ended('o1', { expiresAt: '2999-01-01T00:00:00Z' })];
    server.use(
      http.post('*/api/v1/members/:login/budget-overrides', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/spend');
    const box = await section();
    await choose(box, 'theo');
    const replace = await within(box).findByRole('form', { name: 'Replace the temporary budget' });
    fireEvent.submit(replace);
    fireEvent.submit(within(box).getByRole('form', { name: 'Revoke' }));
    await user.type(within(replace).getByRole('textbox', { name: 'Reason (no secrets)' }), 'more');
    await user.click(within(replace).getByRole('button', { name: 'Replace the temporary budget' }));
    expect(await within(replace).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(db.budgetOverrides[0]?.revokedAt).toBeUndefined();
  });

  it('says why the grants could not be read', async () => {
    server.use(
      http.get('*/api/v1/members/:login/budget-overrides', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'budgets are down' } }, { status: 500 }),
      ),
    );
    visit('/spend');
    const box = await section();
    await choose(box, 'theo');
    expect(await within(box).findByText('budgets are down')).toBeInTheDocument();
  });

  it('is not shown to a member, nor by a server without capacity.budgetoverrides.v1', async () => {
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    setDemoRole(db, 'member');
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({
          dev: { login: 'maya', verified: true, via: 'github' },
          member: { id: MEMBER_IDS.maya, login: 'maya', name: 'Maya', avatarUrl: '', role: 'member' },
          capabilities: [],
        }),
      ),
    );
    visit('/spend');
    expect(await screen.findByRole('heading', { level: 1, name: 'Spend' })).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Temporary daily budgets' })).toBeNull();
    expect(asked.some((path) => path.includes('budget-overrides'))).toBe(false);
  });

  it('is not shown by a server that does not announce it', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'capacity.budgetoverrides.v1')),
        ),
      ),
    );
    visit('/spend');
    expect(await screen.findByRole('region', { name: 'Set a budget' })).toBeInTheDocument();
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Temporary daily budgets' })).toBeNull();
  });
});
