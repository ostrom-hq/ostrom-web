// SPDX-License-Identifier: Apache-2.0
import { handleListInstanceSettings, handleSaveInstanceSettings } from '@gen/api/msw.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

const refused = (status: number, type: string, message: string) =>
  HttpResponse.json({ error: { type, message } }, { status });

async function section(name: string): Promise<HTMLElement> {
  db.instanceAdmin = true;
  return screen.findByRole('region', { name });
}

/** The bodies of the saves the console sent, as the server read them. */
function saves(): unknown[] {
  const sent: unknown[] = [];
  traffic.onRequest((request) => {
    if (request.method === 'PUT') sent.push(request.clone().json());
  });
  return sent;
}

describe('Admin, Settings', () => {
  it('generates a form per section from the fields the server lists, secrets as set or not set', async () => {
    db.instanceAdmin = true;
    visit('/admin/settings');
    const mail = await section('mail');
    expect(within(mail).getByLabelText(/^host/)).toHaveValue('smtp.acme.test');
    expect(within(mail).getByLabelText(/^from/)).toHaveValue('ostrom@acme.test');
    expect(within(mail).getByText('Set')).toBeVisible();
    expect(within(mail).getByText('Version 2')).toBeVisible();
    const push = await section('push');
    expect(within(push).getByText('Not set')).toBeVisible();
    expect(within(push).getAllByText('(required)')).toHaveLength(2);
    expect(within(push).getByText(/imported once from the former environment variables/)).toBeVisible();
    // A secret never shows a value, and a secret that is not set cannot be removed.
    expect(within(push).queryByRole('option', { name: 'Remove' })).toBeNull();
    expect(within(mail).getByRole('option', { name: 'Remove' })).toBeInTheDocument();
    expect(within(mail).queryByDisplayValue('hunter2')).toBeNull();
    expect(within(mail).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a plain field and keeps the secret as it is, sending nothing for it', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    visit('/admin/settings');
    const sent = saves();
    const mail = await section('mail');
    const host = within(mail).getByLabelText(/^host/);
    await user.clear(host);
    await user.type(host, 'mx.acme.test');
    await user.click(within(mail).getByRole('button', { name: 'Save' }));
    expect(await within(mail).findByText('The mail settings are saved.')).toBeVisible();
    expect(await Promise.all(sent)).toEqual([
      { version: 2, values: { host: 'mx.acme.test', from: 'ostrom@acme.test' }, secrets: {} },
    ]);
    expect(within(mail).getByText('Version 3')).toBeVisible();
    expect(within(mail).getByLabelText(/^host/)).toHaveValue('mx.acme.test');
    expect(within(mail).getByText('Set')).toBeVisible();
    // Nothing changed since: nothing to save, and the notice goes with the next edit.
    expect(within(mail).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(within(mail).getByLabelText(/^host/), '!');
    expect(within(mail).queryByText('The mail settings are saved.')).toBeNull();
  });

  it('replaces a secret with what is typed, and shows it as set', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    visit('/admin/settings');
    const sent = saves();
    const push = await section('push');
    await user.type(within(push).getByLabelText(/^keyId/), 'K1');
    await user.selectOptions(within(push).getByLabelText(/^privateKey/), 'Replace');
    const value = within(push).getByPlaceholderText('New value of privateKey');
    expect(value).toHaveAttribute('type', 'password');
    await user.type(value, 'pem-secret');
    await user.click(within(push).getByRole('button', { name: 'Save' }));
    expect(await within(push).findByText('The push settings are saved.')).toBeVisible();
    expect(await Promise.all(sent)).toEqual([
      { version: 0, values: { keyId: 'K1' }, secrets: { privateKey: 'pem-secret' } },
    ]);
    expect(within(push).getByText('Set')).toBeVisible();
    // The typed secret is gone from the page, and the secret is kept again.
    expect(screen.queryByDisplayValue('pem-secret')).toBeNull();
    expect(within(push).getByLabelText(/^privateKey/)).toHaveDisplayValue('Keep as it is');
    expect(within(push).getByText('Version 1')).toBeVisible();
  });

  it('removes a secret that is set, and goes back to keeping it when the choice is undone', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    visit('/admin/settings');
    const sent = saves();
    const mail = await section('mail');
    const choice = within(mail).getByLabelText(/^password/);
    await user.selectOptions(choice, 'Remove');
    expect(within(mail).getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.selectOptions(choice, 'Keep as it is');
    expect(within(mail).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.selectOptions(choice, 'Remove');
    await user.click(within(mail).getByRole('button', { name: 'Save' }));
    expect(await within(mail).findByText('Not set')).toBeVisible();
    expect(await Promise.all(sent)).toEqual([
      {
        version: 2,
        values: { host: 'smtp.acme.test', from: 'ostrom@acme.test' },
        secrets: { password: null },
      },
    ]);
  });

  it('says a refused field in the server’s words, and keeps what was typed', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    server.use(handleSaveInstanceSettings(() => refused(400, 'invalid_settings', 'host: not a host name.')));
    visit('/admin/settings');
    const mail = await section('mail');
    await user.type(within(mail).getByLabelText(/^host/), '!');
    await user.click(within(mail).getByRole('button', { name: 'Save' }));
    expect(await within(mail).findByRole('alert')).toHaveTextContent('host: not a host name.');
    expect(within(mail).getByLabelText(/^host/)).toHaveValue('smtp.acme.test!');
  });

  it('asks to reload when someone saved the section first, and then shows what they saved', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    visit('/admin/settings');
    const mail = await section('mail');
    await user.type(within(mail).getByLabelText(/^from/), '.fr');
    // Another administrator saves the section meanwhile.
    db.instanceSettings = db.instanceSettings.map((item) =>
      item.section === 'mail'
        ? { ...item, version: 3, values: { ...item.values, from: 'ops@acme.test' } }
        : item,
    );
    await user.click(within(mail).getByRole('button', { name: 'Save' }));
    const alert = await within(mail).findByRole('alert');
    expect(alert).toHaveTextContent('Someone saved this section since you opened it.');
    await user.click(within(alert).getByRole('button', { name: 'Reload this section' }));
    await waitFor(() => {
      expect(within(mail).getByLabelText(/^from/)).toHaveValue('ops@acme.test');
    });
    expect(within(mail).getByText('Version 3')).toBeVisible();
    expect(within(mail).queryByRole('alert')).toBeNull();
  });

  it('says there is nothing to configure when the server lists no section', async () => {
    db.instanceAdmin = true;
    server.use(handleListInstanceSettings(() => HttpResponse.json({ sections: [] })));
    visit('/admin/settings');
    expect(await screen.findByText('No settings section')).toBeVisible();
  });

  it('says why the sections did not come', async () => {
    db.instanceAdmin = true;
    server.use(
      handleListInstanceSettings(() => refused(403, 'instance_admin_required', 'Not an administrator.')),
    );
    visit('/admin/settings');
    expect(await screen.findByText('Not an administrator.')).toBeVisible();
  });

  it('moves between the two screens of the administration', async () => {
    const user = userEvent.setup();
    db.instanceAdmin = true;
    const router = visit('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Administration' });
    await user.click(within(nav).getByRole('link', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { name: 'Instance settings' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/admin/settings');
    // The other screen has its own navigation.
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Administration' })).getByRole('link', {
        name: 'Administrators',
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Administrators', level: 1 })).toBeVisible();
  });
});
