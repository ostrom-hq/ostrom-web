// SPDX-License-Identifier: Apache-2.0
import {
  handleAddInstanceAdmin,
  handleGetMe,
  handleListInstanceAdmins,
  handleRemoveInstanceAdmin,
} from '@gen/api/msw.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { DEMO_ADMIN_ID, INSTANCE_ACCOUNTS } from '@/mocks/admin';
import { demoCapabilities } from '@/mocks/capabilities';
import { me } from '@/mocks/fixtures/approvals';
import { FEATURES } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db } = setupMockApp();

function administering(): void {
  db.instanceAdmin = true;
}

async function section(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

const SAM = INSTANCE_ACCOUNTS['sam@acme.test'];
const refused = (status: number, type: string, message: string) =>
  HttpResponse.json({ error: { type, message } }, { status });

describe('the Admin entry of the navigation', () => {
  it('is there for an administrator of the instance on a server that serves it', async () => {
    administering();
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('is not there for anyone else', async () => {
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await within(bar).findByRole('link', { name: 'Sessions' });
    expect(within(bar).queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('is not there when the server does not say it serves it', async () => {
    administering();
    server.use(
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'admin.settings.v1'))),
      ),
    );
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    await within(bar).findByRole('link', { name: 'Sessions' });
    expect(within(bar).queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('says so at the address when the server does not serve the feature', async () => {
    administering();
    server.use(
      http.get('*/api/v1/capabilities', () =>
        HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => feature !== 'admin.settings.v1'))),
      ),
    );
    visit('/admin');
    expect(
      await screen.findByRole('heading', { name: 'Admin is not available on this server' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Administrators' })).toBeNull();
  });
});

describe('Admin, for a person who does not administer the instance', () => {
  it('explains why there is nothing to see, and asks the server for nothing', async () => {
    const asked: string[] = [];
    server.use(
      http.all('*/api/v1/admin/*', ({ request }) => {
        asked.push(request.url);
        return undefined;
      }),
    );
    visit('/admin');
    expect(
      await screen.findByText('Only a person who administers this instance sees this page.'),
    ).toBeVisible();
    expect(asked).toEqual([]);
  });

  it('shows the same on the settings address', async () => {
    visit('/admin/settings');
    expect(
      await screen.findByText('Only a person who administers this instance sees this page.'),
    ).toBeVisible();
  });

  it('waits for the answer on who is signed in before saying anything', async () => {
    administering();
    server.use(
      handleGetMe(async () => {
        await delay(150);
        return HttpResponse.json({ ...me, instanceAdmin: true });
      }),
    );
    visit('/admin');
    expect(await screen.findByRole('heading', { name: 'Administrators', level: 1 })).toBeVisible();
    expect(screen.queryByText('Only a person who administers this instance sees this page.')).toBeNull();
    expect(await screen.findByText('maya')).toBeVisible();
  });
});

describe('Admin, Administrators', () => {
  it('says it is adding while the server answers', async () => {
    administering();
    const user = userEvent.setup();
    server.use(handleAddInstanceAdmin(async () => delay('infinite')));
    visit('/admin');
    await screen.findByText('maya');
    const add = await section('Add an administrator');
    await user.type(within(add).getByLabelText('Verified e-mail address'), 'sam@acme.test');
    await user.click(within(add).getByRole('button', { name: 'Make administrator' }));
    expect(await within(add).findByRole('button', { name: 'Adding' })).toBeDisabled();
  });

  it('lists who administers the instance and how they became one', async () => {
    administering();
    visit('/admin');
    const people = await section('Administrators of the instance').catch(async () =>
      screen.findByRole('list'),
    );
    expect(await within(people).findByText('maya')).toBeVisible();
    expect(within(people).getByText('(you)')).toBeVisible();
    expect(within(people).getByText('maya@acme.test')).toBeVisible();
    expect(within(people).getByText('Setup link')).toBeVisible();
    // The only administrator is never removable.
    expect(within(people).queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('adds an administrator by verified address, and removes one after a second click', async () => {
    administering();
    const user = userEvent.setup();
    visit('/admin');
    await screen.findByText('maya');
    const add = await section('Add an administrator');
    const submit = within(add).getByRole('button', { name: 'Make administrator' });
    expect(submit).toBeDisabled();
    await user.type(within(add).getByLabelText('Verified e-mail address'), ' sam@acme.test ');
    await user.click(submit);
    expect(await screen.findByText('sam')).toBeVisible();
    expect(screen.getByText('Added in the console')).toBeVisible();
    // The form is empty again.
    expect(within(add).getByLabelText('Verified e-mail address')).toHaveValue('');
    expect(db.instanceAdmins.map((admin) => admin.login)).toEqual(['maya', 'sam']);

    const row = within(screen.getByText('sam').closest('li') ?? document.body);
    await user.click(row.getByRole('button', { name: 'Remove' }));
    await user.click(row.getByRole('button', { name: 'Keep' }));
    expect(db.instanceAdmins).toHaveLength(2);
    await user.click(row.getByRole('button', { name: 'Remove' }));
    await user.click(row.getByRole('button', { name: 'Remove sam' }));
    await waitFor(() => {
      expect(db.instanceAdmins.map((admin) => admin.login)).toEqual(['maya']);
    });
    await waitFor(() => {
      expect(screen.queryByText('sam')).toBeNull();
    });
  });

  it('locks the row of the administrator being removed', async () => {
    administering();
    const user = userEvent.setup();
    db.instanceAdmins = [
      ...db.instanceAdmins,
      { userId: SAM?.userId ?? '', login: 'sam', source: 'dashboard', addedAt: '2026-10-03T09:00:00Z' },
    ];
    server.use(handleRemoveInstanceAdmin(async () => delay('infinite')));
    visit('/admin');
    const row = within((await screen.findByText('sam')).closest('li') ?? document.body);
    await user.click(row.getByRole('button', { name: 'Remove' }));
    await user.click(row.getByRole('button', { name: 'Remove sam' }));
    expect(await row.findByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('says an address that belongs to no account, and keeps what was typed', async () => {
    administering();
    const user = userEvent.setup();
    visit('/admin');
    await screen.findByText('maya');
    const add = await section('Add an administrator');
    await user.type(within(add).getByLabelText('Verified e-mail address'), 'nobody@acme.test');
    await user.click(within(add).getByRole('button', { name: 'Make administrator' }));
    expect(await within(add).findByRole('alert')).toHaveTextContent(
      'No account of this instance has this verified address.',
    );
    expect(within(add).getByLabelText('Verified e-mail address')).toHaveValue('nobody@acme.test');
  });

  it('says that the last administrator stays, when the server refuses to remove one', async () => {
    administering();
    const user = userEvent.setup();
    db.instanceAdmins = [
      ...db.instanceAdmins,
      {
        userId: SAM?.userId ?? '',
        login: SAM?.login ?? '',
        source: 'dashboard',
        addedAt: '2026-10-03T09:00:00Z',
      },
    ];
    // Someone else removed the other one meanwhile: the server refuses.
    server.use(
      handleRemoveInstanceAdmin(() => refused(409, 'last_instance_admin', 'The last administrator stays.')),
    );
    visit('/admin');
    await screen.findByText('sam');
    const removes = screen.getAllByRole('button', { name: 'Remove' });
    await user.click(removes[0] ?? document.body);
    await user.click(await screen.findByRole('button', { name: /^Remove maya$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The last administrator of the instance cannot be removed. Add another one first.',
    );
  });

  it('says another refusal in the server’s words', async () => {
    administering();
    const user = userEvent.setup();
    db.instanceAdmins = [
      ...db.instanceAdmins,
      {
        userId: DEMO_ADMIN_ID.replace('2b', '3c'),
        login: 'sam',
        source: 'dashboard',
        addedAt: '2026-10-03T09:00:00Z',
      },
    ];
    server.use(
      handleRemoveInstanceAdmin(() => refused(404, 'instance_admin_not_found', 'Not an administrator.')),
    );
    visit('/admin');
    await screen.findByText('sam');
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1] ?? document.body);
    await user.click(await screen.findByRole('button', { name: 'Remove sam' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not an administrator.');
  });

  it('says why the list did not come', async () => {
    administering();
    server.use(handleListInstanceAdmins(() => refused(500, 'internal', 'The list is unavailable.')));
    visit('/admin');
    expect(await screen.findByText('The list is unavailable.', {}, { timeout: 5000 })).toBeVisible();
  });

  it('names an administrator by address or by id when the server gives no login', async () => {
    administering();
    db.instanceAdmins = [
      {
        userId: DEMO_ADMIN_ID,
        source: 'environment',
        addedAt: '2026-10-01T09:00:00Z',
        email: 'ops@acme.test',
      },
    ];
    visit('/admin');
    expect(await screen.findByText('Environment')).toBeVisible();
    expect(screen.getAllByText('ops@acme.test')).toHaveLength(2);
    expect(screen.queryByText('(you)')).toBeNull();
  });
});
