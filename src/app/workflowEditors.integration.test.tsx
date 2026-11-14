// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { largeMembers } from '@/mocks/fixtures/large';
import { MEMBER_IDS } from '@/mocks/fixtures/organization';
import { setDemoRole } from '@/mocks/orgs';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Who can decide workflows' });
}

function asMember(): void {
  setDemoRole(db, 'member');
  server.use(
    http.get('*/api/v1/auth/me', () =>
      HttpResponse.json({
        dev: { login: 'maya', verified: true, via: 'github' },
        member: { id: MEMBER_IDS.maya, login: 'maya', avatarUrl: '', role: 'member' },
        capabilities: [],
      }),
    ),
  );
}

describe('who can decide workflows', () => {
  it('shows the rule, the administrators by default, and changes it', async () => {
    const user = userEvent.setup();
    visit('/settings');
    const box = await section();
    expect(await within(box).findByRole('radio', { name: 'Owners and admins' })).toBeChecked();
    await user.click(within(box).getByRole('radio', { name: 'Every member' }));
    await user.click(within(box).getByRole('button', { name: 'Save' }));
    expect(await within(box).findByText('Saved.')).toBeInTheDocument();
    expect(db.workflowEditors).toEqual({ mode: 'all' });
  });

  it('chooses members, and asks for at least one', async () => {
    const user = userEvent.setup();
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('radio', { name: /Chosen members/ }));
    const save = within(box).getByRole('button', { name: 'Save' });
    expect(
      await within(box).findByText('Choose at least one member, or pick another rule.'),
    ).toBeInTheDocument();
    expect(save).toBeDisabled();
    const people = await within(box).findAllByRole('checkbox');
    await user.click(people[0] ?? box);
    expect(save).toBeEnabled();
    await user.click(people[0] ?? box);
    expect(save).toBeDisabled();
    await user.click(people[0] ?? box);
    await user.click(save);
    expect(await within(box).findByText('Saved.')).toBeInTheDocument();
    expect(db.workflowEditors.mode).toBe('members');
    expect(db.workflowEditors.memberIds).toHaveLength(1);
  });

  it('says why a save was refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/workflows/settings', () =>
        HttpResponse.json({ error: { type: 'forbidden', message: 'not you' } }, { status: 403 }),
      ),
    );
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('radio', { name: 'Every member' }));
    await user.click(within(box).getByRole('button', { name: 'Save' }));
    expect(await within(box).findByText('not you')).toBeInTheDocument();
  });

  it('lets a member read the rule, not change it', async () => {
    asMember();
    db.workflowEditors = { mode: 'members', memberIds: [MEMBER_IDS.lena] };
    visit('/settings');
    const box = await section();
    expect(await within(box).findByText('Chosen members, and owners and admins')).toBeInTheDocument();
    expect(within(box).getByText('Owners and admins change this.')).toBeInTheDocument();
    expect(within(box).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(await within(box).findByText('lena')).toBeInTheDocument();
  });

  it('reads the rule of a member when the others are every member', async () => {
    asMember();
    visit('/settings');
    const box = await section();
    expect(await within(box).findByText('Owners and admins')).toBeInTheDocument();
  });

  it('says it did not read the rule', async () => {
    server.use(
      http.get('*/api/v1/workflows/settings', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'settings are down' } }, { status: 500 }),
      ),
    );
    visit('/settings');
    const box = await section();
    expect(await within(box).findByText('settings are down', {}, { timeout: 4_000 })).toBeInTheDocument();
  });

  it('is not shown by a server that does not announce it', async () => {
    server.use(
      handleCapabilities(() =>
        HttpResponse.json(
          demoCapabilities(FEATURES.filter((feature) => feature !== 'workflows.settings.v1')),
        ),
      ),
    );
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/settings');
    await screen.findByText('How Acme is named, who is signed in, and deleting it.');
    // nothing is asked of it either
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Who can decide workflows' })).toBeNull();
    expect(asked).not.toContain('/api/v1/workflows/settings');
  });
});

describe('the corners of who decides', () => {
  it('says it is saving while the server takes the rule', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/workflows/settings', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('radio', { name: 'Every member' }));
    await user.click(within(box).getByRole('button', { name: 'Save' }));
    expect(await within(box).findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('reads the members a hundred at a time', async () => {
    const user = userEvent.setup();
    const org = db.organization.id;
    db.orgMembers[org] = [...(db.orgMembers[org] ?? []), ...largeMembers()];
    visit('/settings');
    const box = await section();
    await user.click(await within(box).findByRole('radio', { name: /Chosen members/ }));
    const more = await within(box).findByRole('button', { name: 'More members' });
    await vi.waitFor(() => {
      expect(more).toBeEnabled();
    });
    await user.click(more);
    await vi.waitFor(() => {
      expect(within(box).getAllByRole('checkbox').length).toBeGreaterThan(100);
    });
  });
});
