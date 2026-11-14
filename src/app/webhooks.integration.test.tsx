// SPDX-License-Identifier: Apache-2.0
import { handleCreateWebhook, handleListWebhooks, handleUpdateWebhook } from '@gen/api/msw.gen';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { setDemoRole } from '@/mocks/orgs';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function webhookRows(): Promise<HTMLElement[]> {
  const heading = await screen.findByRole('heading', { level: 2, name: 'Your webhooks' });
  const list = heading.parentElement?.querySelector('ul');
  if (list === null || list === undefined) throw new Error('no list of webhooks');
  return within(list).getAllByRole('listitem');
}

function addForm(): HTMLElement {
  return screen.getByRole('region', { name: 'Add a webhook' });
}

describe('the webhooks screen', { timeout: 15_000 }, () => {
  it('lists the webhooks with their URL, description, events and state', async () => {
    visit('/webhooks');
    const [live, paused, failing] = await webhookRows();
    expect(screen.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeInTheDocument();
    expect(live).toHaveTextContent('https://hooks.acme.dev/ostrom');
    expect(live).toHaveTextContent('Waits to the on-call channel');
    expect(live).toHaveTextContent('cloud.wait.cancelled, cloud.wait.created, cloud.wait.resolved');
    expect(within(live ?? document.body).getByText('Enabled')).toBeInTheDocument();
    expect(paused).toHaveTextContent('Disabled · paused');
    expect(failing).toHaveTextContent('Disabled · too many failures');
    expect(within(live ?? document.body).getByRole('link')).toHaveAttribute('href', '/webhooks/wh-1');
  });

  it('explains how webhooks work with the Ostrom headers', async () => {
    const user = userEvent.setup();
    visit('/webhooks');
    await webhookRows();
    await user.click(screen.getByText('How webhooks work'));
    for (const header of ['Ostrom-Delivery', 'Ostrom-Event', 'Ostrom-Timestamp', 'Ostrom-Signature']) {
      expect(screen.getByText(header)).toBeVisible();
    }
    expect(screen.queryByText(/TeamCode-/)).toBeNull();
  });

  it('says so when there is no webhook yet', async () => {
    db.webhooks = [];
    visit('/webhooks');
    expect(await screen.findByText('No webhooks yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Your webhooks' })).toBeNull();
  });

  it('adds a webhook with every event ticked, then shows its secret once, until it is copied', async () => {
    const user = userEvent.setup();
    visit('/webhooks');
    await webhookRows();
    const form = addForm();
    const add = within(form).getByRole('button', { name: 'Add webhook' });
    expect(add).toBeDisabled();
    for (const type of [
      'cloud.wait.created',
      'cloud.wait.resolved',
      'cloud.wait.cancelled',
      'cloud.workflow.run.updated',
      'cloud.todo',
    ]) {
      expect(within(form).getByRole('checkbox', { name: type })).toBeChecked();
    }
    await user.type(within(form).getByRole('textbox', { name: 'URL (https)' }), 'http://example.com/hook');
    expect(within(form).getByText(/must start with https/)).toBeInTheDocument();
    expect(add).toBeDisabled();
    await user.clear(within(form).getByRole('textbox', { name: 'URL (https)' }));
    await user.type(within(form).getByRole('textbox', { name: 'URL (https)' }), 'https://example.com/hook');
    await user.type(within(form).getByRole('textbox', { name: 'Description' }), 'Everything');
    await user.click(within(form).getByRole('checkbox', { name: 'cloud.todo' }));
    await user.click(within(form).getByRole('checkbox', { name: 'cloud.wait.created' }));
    await user.click(within(form).getByRole('checkbox', { name: 'cloud.wait.created' }));
    await user.click(add);
    const secret = await screen.findByRole('textbox', { name: 'Signing secret' });
    const shown = secret instanceof HTMLInputElement ? secret.value : 'no secret';
    expect(shown).toMatch(/^whsec_/);
    expect(screen.getByRole('alert')).toHaveTextContent('shown once, store it now');
    expect(within(form).getByRole('button', { name: 'Add webhook' })).toBeDisabled();
    await waitFor(async () => {
      expect(await webhookRows()).toHaveLength(4);
    });
    const made = (await webhookRows())[3];
    expect(made).toHaveTextContent('https://example.com/hook');
    expect(made).not.toHaveTextContent(shown);
    expect(db.webhooks[3]).toMatchObject({
      url: 'https://example.com/hook',
      description: 'Everything',
      types: [
        'cloud.wait.cancelled',
        'cloud.wait.created',
        'cloud.wait.resolved',
        'cloud.workflow.run.updated',
      ],
    });
    expect(screen.getByRole('link', { name: 'Open https://example.com/hook' })).toHaveAttribute(
      'href',
      '/webhooks/wh-4',
    );
    await user.click(screen.getByRole('button', { name: 'I copied it' }));
    expect(screen.queryByRole('textbox', { name: 'Signing secret' })).toBeNull();
  });

  it('says it is adding while the server takes the webhook, and nothing is sent twice', async () => {
    const user = userEvent.setup();
    let sent = 0;
    server.use(
      handleCreateWebhook(async () => {
        sent += 1;
        await delay(300);
        return HttpResponse.json({ error: { type: 'webhook_limit', message: 'Too many.' } }, { status: 409 });
      }),
    );
    visit('/webhooks');
    await webhookRows();
    const form = addForm();
    await user.type(within(form).getByRole('textbox', { name: 'URL (https)' }), 'https://example.com/hook');
    await user.click(within(form).getByRole('button', { name: 'Add webhook' }));
    expect(await within(form).findByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(await within(form).findByRole('alert')).toHaveTextContent('Too many.');
    expect(sent).toBe(1);
  });

  it('says a webhook disabled with no reason is only disabled', async () => {
    db.webhooks = db.webhooks.map((hook) => {
      const copy = { ...hook };
      delete copy.disabledReason;
      return copy;
    });
    visit('/webhooks');
    const rows = await webhookRows();
    expect(rows[1]).toHaveTextContent('Disabled');
    expect(rows[1]).not.toHaveTextContent('Disabled ·');
  });

  it('asks for one event at least', async () => {
    const user = userEvent.setup();
    visit('/webhooks');
    await webhookRows();
    const form = addForm();
    await user.type(within(form).getByRole('textbox', { name: 'URL (https)' }), 'https://example.com/hook');
    for (const box of within(form).getAllByRole('checkbox')) await user.click(box);
    expect(within(form).getByText('Tick at least one event.')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Add webhook' })).toBeDisabled();
  });

  it('says why the server refused a webhook', async () => {
    const user = userEvent.setup();
    visit('/webhooks');
    await webhookRows();
    const form = addForm();
    await user.type(within(form).getByRole('textbox', { name: 'URL (https)' }), 'https://localhost/hook');
    await user.click(within(form).getByRole('button', { name: 'Add webhook' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('This address is not a public host.');
    expect(screen.queryByRole('textbox', { name: 'Signing secret' })).toBeNull();
    expect(db.webhooks).toHaveLength(3);
  });

  it('is for owners and admins: a member is told so and no webhook is asked for', async () => {
    setDemoRole(db, 'member');
    const asked: string[] = [];
    traffic.onRequest((request) => {
      if (request.url.includes('/webhooks')) asked.push(request.url);
    });
    visit('/webhooks');
    expect(await screen.findByText('Owners and admins only')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Add a webhook' })).toBeNull();
    expect(asked).toEqual([]);
  });

  it('shows a failure to read the list', async () => {
    server.use(
      handleListWebhooks(() =>
        HttpResponse.json({ error: { type: 'internal', message: 'down' } }, { status: 500 }),
      ),
    );
    visit('/webhooks');
    expect(await screen.findByText('down')).toBeInTheDocument();
  });
});

describe('the navigation entry', () => {
  it('is shown to an owner', async () => {
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Webhooks' })).toBeVisible();
  });

  it('is hidden from a member', async () => {
    setDemoRole(db, 'member');
    visit('/yes');
    const bar = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(bar).findByRole('link', { name: 'Members' })).toBeVisible();
    expect(within(bar).queryByRole('link', { name: 'Webhooks' })).toBeNull();
  });
});

describe('a webhook’s page', { timeout: 15_000 }, () => {
  it('shows its state, its settings and its latest deliveries in UTC', async () => {
    visit('/webhooks/wh-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'https://hooks.acme.dev/ostrom' }),
    ).toBeInTheDocument();
    const state = screen.getByRole('region', { name: 'State' });
    expect(state).toHaveTextContent('Enabled');
    expect(state).toHaveTextContent('0 failed deliveries in a row');
    expect(state).toHaveTextContent('created 2026-11-02 09:00:00 UTC');
    const settings = screen.getByRole('region', { name: 'Settings' });
    expect(within(settings).getByRole('textbox', { name: 'URL (https)' })).toHaveValue(
      'https://hooks.acme.dev/ostrom',
    );
    expect(within(settings).getByRole('checkbox', { name: 'cloud.todo' })).not.toBeChecked();
    expect(within(settings).getByRole('checkbox', { name: 'Enabled' })).toBeChecked();
    const log = await screen.findByRole('table');
    const rows = within(log).getAllByRole('row');
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('2026-11-14 10:00:00');
    expect(rows[1]).toHaveTextContent('cloud.wait.created #42');
    expect(rows[1]).toHaveTextContent('pending');
    expect(rows[1]).toHaveTextContent('2 · next 2026-11-14 10:02:00');
    expect(rows[1]).toHaveTextContent('503');
    expect(rows[2]).toHaveTextContent('failed');
    expect(rows[2]).toHaveTextContent('timeout');
    expect(rows[3]).toHaveTextContent('webhook.test');
    expect(rows[3]).toHaveTextContent('delivered');
    expect(screen.getByText(/The 50 latest, kept 14 days/)).toBeInTheDocument();
  });

  it('says why a webhook is disabled, and how many deliveries failed in a row', async () => {
    visit('/webhooks/wh-3');
    const state = await screen.findByRole('region', { name: 'State' });
    expect(state).toHaveTextContent('Disabled · too many failures');
    expect(state).toHaveTextContent('20 failed deliveries in a row');
    expect(state).toHaveTextContent('Twenty final failures in a row disabled it');
    expect(await screen.findByText('No delivery yet.')).toBeInTheDocument();
  });

  it('says a paused webhook was paused by a person', async () => {
    visit('/webhooks/wh-2');
    expect(await screen.findByText(/A person paused it/)).toBeInTheDocument();
  });

  it('saves its settings, and enabling a paused webhook turns it on', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-2');
    const settings = await screen.findByRole('region', { name: 'Settings' });
    await user.clear(within(settings).getByRole('textbox', { name: 'URL (https)' }));
    await user.type(within(settings).getByRole('textbox', { name: 'URL (https)' }), 'https://ci.acme.dev/v2');
    await user.type(within(settings).getByRole('textbox', { name: 'Description' }), 'CI runs');
    await user.click(within(settings).getByRole('checkbox', { name: 'cloud.todo' }));
    await user.click(within(settings).getByRole('checkbox', { name: 'Enabled' }));
    await user.click(within(settings).getByRole('button', { name: 'Save webhook' }));
    expect(await within(settings).findByText('Saved.')).toBeInTheDocument();
    expect(db.webhooks[1]).toMatchObject({
      url: 'https://ci.acme.dev/v2',
      description: 'CI runs',
      types: ['cloud.todo', 'cloud.workflow.run.updated'],
      enabled: true,
      version: 3,
    });
    expect(db.webhooks[1]?.disabledReason).toBeUndefined();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'https://ci.acme.dev/v2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'State' })).toHaveTextContent('Enabled');
  });

  it('keeps a paused webhook paused when only its URL changes', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-2');
    const settings = await screen.findByRole('region', { name: 'Settings' });
    await user.type(within(settings).getByRole('textbox', { name: 'Description' }), 'x');
    await user.click(within(settings).getByRole('button', { name: 'Save webhook' }));
    expect(await within(settings).findByText('Saved.')).toBeInTheDocument();
    expect(db.webhooks[1]).toMatchObject({ enabled: false, disabledReason: 'disabled' });
  });

  it('asks to reload when the webhook changed meanwhile (409 stale_version)', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    const settings = await screen.findByRole('region', { name: 'Settings' });
    db.webhooks = db.webhooks.map((hook) =>
      hook.id === 'wh-1' ? { ...hook, version: 2, url: 'https://hooks.acme.dev/moved' } : hook,
    );
    await user.type(within(settings).getByRole('textbox', { name: 'Description' }), '!');
    await user.click(within(settings).getByRole('button', { name: 'Save webhook' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent('changed since you opened it');
    await user.click(within(settings).getByRole('button', { name: 'Reload' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'https://hooks.acme.dev/moved' }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Settings' })).queryByRole('alert')).toBeNull();
  });

  it('says what the server refused on a save', async () => {
    const user = userEvent.setup();
    server.use(
      handleUpdateWebhook(() =>
        HttpResponse.json({ error: { type: 'invalid_webhook', message: 'Nope.' } }, { status: 400 }),
      ),
    );
    visit('/webhooks/wh-1');
    const settings = await screen.findByRole('region', { name: 'Settings' });
    await user.click(within(settings).getByRole('button', { name: 'Save webhook' }));
    expect(await within(settings).findByRole('alert')).toHaveTextContent('Nope.');
  });

  it('refreshes the deliveries', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    await screen.findByRole('table');
    db.webhookDeliveries['wh-1'] = [];
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No delivery yet.')).toBeInTheDocument();
  });

  it('sends a test, which shows in the deliveries, and a fourth one in ten seconds is refused', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    await screen.findByRole('table');
    const actions = screen.getByRole('region', { name: 'Actions' });
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    expect(await within(actions).findByText(/A test delivery is queued/)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(5);
    });
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    await waitFor(() => {
      expect(db.webhookTests['wh-1']).toHaveLength(3);
    });
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    expect(await within(actions).findByRole('alert')).toHaveTextContent('At most 3 tests in 10 seconds');
  });

  it('rotates the secret, shows the new one once, and locks the other actions until it is copied', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    const actions = await screen.findByRole('region', { name: 'Actions' });
    await user.click(within(actions).getByRole('button', { name: 'Rotate the secret' }));
    await user.click(within(actions).getByRole('button', { name: 'Rotate the secret now' }));
    const secret = await within(actions).findByRole('textbox', { name: 'Signing secret' });
    expect(secret instanceof HTMLInputElement ? secret.value : '').toMatch(/^whsec_/);
    expect(within(actions).getByRole('button', { name: 'Send a test' })).toBeDisabled();
    await user.click(within(actions).getByRole('button', { name: 'I copied it' }));
    expect(within(actions).queryByRole('textbox', { name: 'Signing secret' })).toBeNull();
    expect(within(actions).getByRole('button', { name: 'Send a test' })).toBeEnabled();
  });

  it('keeps Rotate on a second look: Keep goes back', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    const actions = await screen.findByRole('region', { name: 'Actions' });
    await user.click(within(actions).getByRole('button', { name: 'Rotate the secret' }));
    await user.click(within(actions).getByRole('button', { name: 'Keep' }));
    expect(within(actions).getByRole('button', { name: 'Rotate the secret' })).toBeVisible();
    expect(within(actions).queryByRole('textbox', { name: 'Signing secret' })).toBeNull();
  });

  it('deletes the webhook after a confirmation, and comes back to the list', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-3');
    const actions = await screen.findByRole('region', { name: 'Actions' });
    await user.click(within(actions).getByRole('button', { name: 'Delete webhook' }));
    await user.click(within(actions).getByRole('button', { name: 'Delete this webhook and its deliveries' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Your webhooks' })).toBeInTheDocument();
    expect(await webhookRows()).toHaveLength(2);
    expect(db.webhooks.map((hook) => hook.id)).toEqual(['wh-1', 'wh-2']);
  });

  it('says what the server refused on an action, and a test, a rotation or a deletion clears the last one', async () => {
    const user = userEvent.setup();
    visit('/webhooks/wh-1');
    const actions = await screen.findByRole('region', { name: 'Actions' });
    db.webhooks = [];
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    expect(await within(actions).findByRole('alert')).toHaveTextContent('webhook not found');
    await user.click(within(actions).getByRole('button', { name: 'Rotate the secret' }));
    await user.click(within(actions).getByRole('button', { name: 'Rotate the secret now' }));
    await waitFor(() => {
      expect(within(actions).getByRole('alert')).toHaveTextContent('webhook not found');
    });
    await user.click(within(actions).getByRole('button', { name: 'Delete webhook' }));
    await user.click(within(actions).getByRole('button', { name: 'Delete this webhook and its deliveries' }));
    await waitFor(() => {
      expect(within(actions).getByRole('alert')).toHaveTextContent('webhook not found');
    });
    await user.click(within(actions).getByRole('button', { name: 'Send a test' }));
    await waitFor(() => {
      expect(within(actions).getByRole('alert')).toHaveTextContent('webhook not found');
    });
  });

  it('says there is no such webhook', async () => {
    visit('/webhooks/wh-404');
    expect(await screen.findByText('No such webhook')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All webhooks' })).toHaveAttribute('href', '/webhooks');
  });

  it('is for owners and admins: a member is told so', async () => {
    setDemoRole(db, 'member');
    visit('/webhooks/wh-1');
    expect(await screen.findByText('Owners and admins only')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull();
  });
});
