// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { DISCORD_AUTHORIZE } from '@/mocks/notifications';
import { FEATURES, type FeatureKey } from '@/shared/capabilities/model';
import { exit } from '@/shared/lib/leave';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function region(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
}

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item ${String(index)}`);
  return item;
}

function without(...features: readonly FeatureKey[]): void {
  server.use(
    handleCapabilities(() =>
      HttpResponse.json(demoCapabilities(FEATURES.filter((feature) => !features.includes(feature)))),
    ),
  );
}

describe('what a person is told about', () => {
  it('shows a switch per kind and channel, and saves one at once', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    expect(await screen.findByRole('heading', { level: 1, name: 'My notifications' })).toBeInTheDocument();
    const box = await region('What you are told about');
    const finished = await within(box).findByRole('group', { name: 'An agent finished its turn' });
    const push = within(finished).getByRole('checkbox', { name: 'Push to your phones' });
    expect(push).not.toBeChecked();
    expect(
      within(box).getByText('A question, a permission request or a wait assigned to you.'),
    ).toBeInTheDocument();
    await user.click(push);
    await vi.waitFor(() => {
      expect(push).toBeChecked();
    });
    expect(db.notificationSwitches.find((one) => one.kind === 'turn_completed')?.enabled).toBe(true);
  });

  it('holds the switches while one is on its way', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/notifications/settings', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/me/notifications');
    const box = await region('What you are told about');
    const waiting = await within(box).findByRole('group', { name: 'An agent waits for you' });
    const push = within(waiting).getByRole('checkbox', { name: 'Push to your phones' });
    await user.click(push);
    await vi.waitFor(() => {
      for (const one of within(box).getAllByRole('checkbox')) expect(one).toBeDisabled();
    });
    expect(push).not.toBeChecked();
    const finished = within(box).getByRole('group', { name: 'An agent finished its turn' });
    expect(within(finished).getByRole('checkbox', { name: 'Push to your phones' })).not.toBeChecked();
  });

  it('shows the switch turned in the click itself, before the server answers', async () => {
    server.use(
      http.put('*/api/v1/notifications/settings', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/me/notifications');
    const box = await region('What you are told about');
    const waiting = await within(box).findByRole('group', { name: 'An agent waits for you' });
    const push = within(waiting).getByRole('checkbox', { name: 'Push to your phones' });
    expect(push).toBeChecked();
    fireEvent.click(push);
    // No wait: whoever reads the switch right after the click sees it turned.
    expect(push).not.toBeChecked();
  });

  it('says why a switch was refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/notifications/settings', () =>
        HttpResponse.json(
          { error: { type: 'invalid_notification_setting', message: 'not this one' } },
          { status: 400 },
        ),
      ),
    );
    visit('/me/notifications');
    const box = await region('What you are told about');
    const waiting = await within(box).findByRole('group', { name: 'An agent waits for you' });
    await user.click(within(waiting).getByRole('checkbox', { name: 'Push to your phones' }));
    expect(await within(box).findByText('not this one')).toBeInTheDocument();
  });

  it('names a kind and a channel it does not know by their wire values', async () => {
    server.use(
      http.get('*/api/v1/notifications/settings', () =>
        HttpResponse.json({
          channels: ['pager'],
          settings: [{ channel: 'pager', kind: 'budget_reached', enabled: true }],
        }),
      ),
    );
    visit('/me/notifications');
    const box = await region('What you are told about');
    const group = await within(box).findByRole('group', { name: 'budget_reached' });
    expect(within(group).getByRole('checkbox', { name: 'pager' })).toBeChecked();
  });

  it('says when the server offers no channel', async () => {
    db.notificationChannels = [];
    visit('/me/notifications');
    const box = await region('What you are told about');
    expect(
      await within(box).findByText('This server offers no notification channel yet. Ask whoever runs it.'),
    ).toBeInTheDocument();
  });

  it('says it did not read the switches', async () => {
    server.use(
      http.get('*/api/v1/notifications/settings', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'switches are down' } }, { status: 500 }),
      ),
    );
    visit('/me/notifications');
    const box = await region('What you are told about');
    expect(await within(box).findByText('switches are down', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('approvals on the phone', () => {
  it('saves the switches and quiet hours', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    const box = await region('Approvals on your phone');
    await user.click(await within(box).findByRole('checkbox', { name: 'A budget about to be reached' }));
    await user.click(within(box).getByRole('checkbox', { name: 'No notifications during these hours' }));
    const zone = within(box).getByLabelText('Time zone');
    await user.clear(zone);
    await user.type(zone, 'Europe/Paris');
    await user.click(within(box).getByRole('button', { name: 'Save' }));
    expect(await within(box).findByText('Saved.')).toBeInTheDocument();
    expect(db.notificationPreferences).toEqual({
      requests: true,
      decisions: true,
      spending: true,
      quietHours: { start: '22:00', end: '07:00', timeZone: 'Europe/Paris' },
    });
  });

  it('says what keeps quiet hours from being saved', async () => {
    const user = userEvent.setup();
    db.notificationPreferences = {
      requests: true,
      decisions: true,
      spending: false,
      quietHours: { start: '12:00', end: '13:00', timeZone: 'UTC' },
    };
    visit('/me/notifications');
    const box = await region('Approvals on your phone');
    const end = await within(box).findByLabelText('Until');
    const save = within(box).getByRole('button', { name: 'Save' });
    await user.clear(end);
    await user.type(end, '12:00');
    const problem = await within(box).findByRole('alert');
    expect(problem).toHaveTextContent('The start and the end must differ.');
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-describedby', problem.id);
    const start = within(box).getByLabelText('From');
    await user.clear(start);
    expect(within(box).getByText('Give a start and an end, as hours and minutes.')).toBeInTheDocument();
    await user.type(start, '11:00');
    const zone = within(box).getByLabelText('Time zone');
    await user.clear(zone);
    expect(within(box).getByText('Give a time zone such as Europe/Paris, or UTC.')).toBeInTheDocument();
    await user.type(zone, 'UTC');
    expect(save).toBeEnabled();
    expect(save).not.toHaveAttribute('aria-describedby');
    // A browser that gives seconds: they are dropped, as the server takes HH:MM.
    fireEvent.change(within(box).getByLabelText('From'), { target: { value: '09:15:00' } });
    expect(within(box).getByLabelText('From')).toHaveValue('09:15');
    expect(save).toBeEnabled();
    await user.click(within(box).getByRole('checkbox', { name: 'No notifications during these hours' }));
    expect(within(box).queryByLabelText('From')).toBeNull();
  });

  it('says it is saving, and why a save was refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.put('*/api/v1/me/notifications', async () => {
        await delay(100);
        return HttpResponse.json(
          { error: { type: 'forbidden', message: 'not with this token' } },
          { status: 403 },
        );
      }),
    );
    visit('/me/notifications');
    const box = await region('Approvals on your phone');
    await user.click(await within(box).findByRole('checkbox', { name: 'A request that waits for my yes' }));
    await user.click(within(box).getByRole('button', { name: 'Save' }));
    expect(await within(box).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    // Nothing can be changed while the server takes it: no edit is lost under a "Saved.".
    expect(within(box).getByRole('checkbox', { name: 'A budget about to be reached' })).toBeDisabled();
    expect(await within(box).findByText('not with this token')).toBeInTheDocument();
  });
});

describe('the phones notified', () => {
  it('lists them, and stops one after a confirmation', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    const box = await region('Registered phones');
    const phones = await within(box).findByRole('list', { name: 'Registered phones' });
    expect(within(phones).getByText('iPhone')).toBeInTheDocument();
    expect(within(phones).getByText('Android phone')).toBeInTheDocument();
    await user.click(nth(within(phones).getAllByRole('button', { name: 'Remove' }), 0));
    await user.click(await within(phones).findByRole('button', { name: 'Stop notifying iPhone' }));
    await vi.waitFor(() => {
      expect(within(box).queryByText('iPhone')).toBeNull();
    });
    expect(db.pushDevices.map((phone) => phone.id)).toEqual(['pd_android']);
  });

  it('keeps a phone when the confirmation is declined', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    const box = await region('Registered phones');
    const phones = await within(box).findByRole('list', { name: 'Registered phones' });
    await user.click(nth(within(phones).getAllByRole('button', { name: 'Remove' }), 0));
    await user.click(within(phones).getByRole('button', { name: 'Keep' }));
    expect(db.pushDevices).toHaveLength(2);
    expect(within(phones).getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('holds every phone while one is on its way out', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/push-devices/:id', async () => {
        await delay('infinite');
        return undefined;
      }),
    );
    visit('/me/notifications');
    const box = await region('Registered phones');
    const phones = await within(box).findByRole('list', { name: 'Registered phones' });
    await user.click(nth(within(phones).getAllByRole('button', { name: 'Remove' }), 0));
    await user.click(await within(phones).findByRole('button', { name: 'Stop notifying iPhone' }));
    await vi.waitFor(() => {
      for (const button of within(phones).getAllByRole('button', { name: 'Remove' }))
        expect(button).toBeDisabled();
    });
  });

  it('says there is none, and names a platform it does not know by its wire value', async () => {
    db.pushDevices = [];
    visit('/me/notifications');
    const box = await region('Registered phones');
    expect(
      await within(box).findByText(
        'No phone is registered yet. Sign in with the app on your phone and allow notifications.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an unknown platform as text', async () => {
    db.pushDevices = [{ id: 'pd_x', provider: 'fcm', platform: 'watch', createdAt: '2026-11-10T08:30:00Z' }];
    visit('/me/notifications');
    const box = await region('Registered phones');
    expect(await within(box).findByText('watch')).toBeInTheDocument();
  });

  it('says why a phone was not stopped, and reads the list again', async () => {
    const user = userEvent.setup();
    server.use(
      http.delete('*/api/v1/push-devices/:id', () =>
        HttpResponse.json({ error: { type: 'not_found', message: 'already gone' } }, { status: 404 }),
      ),
    );
    visit('/me/notifications');
    const box = await region('Registered phones');
    const phones = await within(box).findByRole('list', { name: 'Registered phones' });
    await user.click(nth(within(phones).getAllByRole('button', { name: 'Remove' }), 1));
    await user.click(await within(phones).findByRole('button', { name: 'Stop notifying Android phone' }));
    expect(await within(box).findByText('already gone')).toBeInTheDocument();
  });

  it('says it did not read them', async () => {
    server.use(
      http.get('*/api/v1/push-devices', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'phones are down' } }, { status: 500 }),
      ),
    );
    visit('/me/notifications');
    const box = await region('Registered phones');
    expect(await within(box).findByText('phones are down', {}, { timeout: 4_000 })).toBeInTheDocument();
  });
});

describe('a test notification', () => {
  it('sends one and lists each phone’s answer', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    const box = await region('Test');
    await user.click(within(box).getByRole('button', { name: 'Send a test notification' }));
    expect(await within(box).findByText('Sent to 1 phone. It shows in a few seconds.')).toBeInTheDocument();
    const phones = within(box).getByRole('list', { name: 'Your phones' });
    expect(within(phones).getByText('Sent')).toBeInTheDocument();
    expect(within(phones).getByText('No longer registered: open the app on this phone')).toBeInTheDocument();
    expect(within(phones).getByText('unregistered')).toBeInTheDocument();
  });

  it('says no phone took it, naming a status it does not know', async () => {
    const user = userEvent.setup();
    db.pushPhones = [{ status: 'parked' }];
    visit('/me/notifications');
    const box = await region('Test');
    await user.click(within(box).getByRole('button', { name: 'Send a test notification' }));
    expect(
      await within(box).findByText(
        'None of your phones accepted the test. Open the app on your phone, then try again.',
      ),
    ).toBeInTheDocument();
    expect(within(box).getByText('parked')).toBeInTheDocument();
  });

  it('says why none was sent', async () => {
    const user = userEvent.setup();
    db.pushProvider = 'off';
    visit('/me/notifications');
    const box = await region('Test');
    const send = within(box).getByRole('button', { name: 'Send a test notification' });
    await user.click(send);
    expect(
      await within(box).findByText(
        'Push notifications are off on this server. An administrator turns them on in Admin, Settings.',
      ),
    ).toBeInTheDocument();
    db.pushProvider = 'relay';
    db.pushPhones = [];
    await user.click(send);
    expect(
      await within(box).findByText(
        'No phone is registered yet. Sign in with the app on your phone and allow notifications.',
      ),
    ).toBeInTheDocument();
    db.pushPhones = [{ status: 'sent' }];
    db.lastPushTestAt = Date.now();
    await user.click(send);
    expect(
      await within(box).findByText('A test was just sent. Wait a few seconds, then try again.'),
    ).toBeInTheDocument();
  });

  it('says it is sending, and any other failure as the server said it', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/notifications/push/test', async () => {
        await delay(100);
        return HttpResponse.json(
          { error: { type: 'forbidden', message: 'not with a key' } },
          { status: 403 },
        );
      }),
    );
    visit('/me/notifications');
    const box = await region('Test');
    await user.click(within(box).getByRole('button', { name: 'Send a test notification' }));
    expect(await within(box).findByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(await within(box).findByText('not with a key')).toBeInTheDocument();
  });
});

describe('a server without notifications', () => {
  it('shows no section it does not serve, and asks nothing of it', async () => {
    without('notifications.push.v1', 'notifications.push.test.v1');
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/me/notifications');
    await region('What you are told about');
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Approvals on your phone' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Test' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Registered phones' })).toBeNull();
    expect(asked).not.toContain('/api/v1/me/notifications');
    expect(asked).not.toContain('/api/v1/push-devices');
  });

  it('keeps the phone and the test without the switches', async () => {
    without('notifications.v1');
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/me/notifications');
    await screen.findByRole('heading', { level: 1 });
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'What you are told about' })).toBeNull();
    expect(asked).not.toContain('/api/v1/notifications/settings');
  });
});

describe('the Slack account', () => {
  it('links the Slack account of the proven address, then unlinks it', async () => {
    const user = userEvent.setup();
    visit('/me/notifications');
    const box = await region('Slack');
    await user.click(await within(box).findByRole('button', { name: 'Link my Slack account' }));
    expect(await within(box).findByText('Linked')).toBeInTheDocument();
    expect(db.slackLinked?.slackUserId).toBe('U024BE7LH');
    await user.click(within(box).getByRole('button', { name: 'Unlink' }));
    expect(await within(box).findByRole('button', { name: 'Link my Slack account' })).toBeInTheDocument();
    expect(db.slackLinked).toBeUndefined();
  });

  it('says why no account is linked', async () => {
    const user = userEvent.setup();
    db.slackDirectory = undefined;
    visit('/me/notifications');
    const box = await region('Slack');
    await user.click(await within(box).findByRole('button', { name: 'Link my Slack account' }));
    expect(
      await within(box).findByText('No active Slack account of this workspace has your e-mail address.'),
    ).toBeInTheDocument();
  });

  it('says it is linking, then what failed when the server answers no known refusal', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/slack/link', async () => {
        await delay(100);
        return HttpResponse.json({ error: { type: 'internal', message: 'slack is down' } }, { status: 500 });
      }),
    );
    visit('/me/notifications');
    const box = await region('Slack');
    await user.click(await within(box).findByRole('button', { name: 'Link my Slack account' }));
    expect(await within(box).findByRole('button', { name: 'Linking…' })).toBeDisabled();
    expect(await within(box).findByText('slack is down')).toBeInTheDocument();
  });

  it('points at the administrators while Slack is not set', async () => {
    db.slackConfigured = false;
    visit('/me/notifications');
    const box = await region('Slack');
    expect(await within(box).findByText(/An administrator sets the Slack app/u)).toBeInTheDocument();
    expect(within(box).queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks nothing of a server without Slack', async () => {
    without('slack.v1');
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/me/notifications');
    await region('What you are told about');
    await new Promise((done) => setTimeout(done, 200));
    expect(screen.queryByRole('region', { name: 'Slack' })).toBeNull();
    expect(asked).not.toContain('/api/v1/slack/link');
  });
});

describe('the Discord account', () => {
  it("sends the browser to Discord's sign-in, nowhere else", async () => {
    const user = userEvent.setup();
    const leave = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    visit('/me/notifications');
    const box = await region('Discord');
    await user.click(await within(box).findByRole('button', { name: 'Link my Discord account' }));
    await vi.waitFor(() => {
      expect(leave).toHaveBeenCalledTimes(1);
    });
    expect(nth(nth(leave.mock.calls, 0), 0).startsWith(`${DISCORD_AUTHORIZE}?`)).toBe(true);
    expect(await within(box).findByRole('button', { name: 'Opening Discord…' })).toBeDisabled();
    // Back from Discord's page without finishing: the section is usable again.
    fireEvent(window, new Event('pageshow'));
    expect(await within(box).findByRole('button', { name: 'Link my Discord account' })).toBeEnabled();
    leave.mockRestore();
  });

  it('opens nothing when the server names a page that is not https', async () => {
    const user = userEvent.setup();
    const leave = vi.spyOn(exit, 'assign').mockImplementation(() => undefined);
    server.use(
      http.post('*/api/v1/discord/link', () => HttpResponse.json({ authorizeUrl: 'http://evil.test/' })),
    );
    visit('/me/notifications');
    const box = await region('Discord');
    await user.click(await within(box).findByRole('button', { name: 'Link my Discord account' }));
    expect(await within(box).findByText(/nothing was opened/u)).toBeInTheDocument();
    expect(leave).not.toHaveBeenCalled();
    leave.mockRestore();
  });

  it('says the account is linked when Discord sends the browser back, and unlinks it', async () => {
    const user = userEvent.setup();
    db.discordLinked = {
      discordUserId: '80351110224678912',
      discordUsername: 'nelly',
      linkedAt: '2026-11-15T10:00:00Z',
    };
    visit('/me/notifications?discord=linked');
    const box = await region('Discord');
    expect(await within(box).findByText('Your Discord account is linked.')).toBeInTheDocument();
    expect(await within(box).findByText(/Your Discord account nelly receives/u)).toBeInTheDocument();
    await user.click(within(box).getByRole('button', { name: 'Unlink' }));
    expect(await within(box).findByRole('button', { name: 'Link my Discord account' })).toBeInTheDocument();
    expect(db.discordLinked).toBeUndefined();
  });

  it('says nothing of a return that did not link', async () => {
    visit('/me/notifications?discord=linked');
    const box = await region('Discord');
    expect(await within(box).findByRole('button', { name: 'Link my Discord account' })).toBeInTheDocument();
    expect(within(box).queryByText('Your Discord account is linked.')).toBeNull();
  });

  it('says the account is linked without a name the server did not give', async () => {
    db.discordLinked = { discordUserId: '80351110224678912', linkedAt: '2026-11-15T10:00:00Z' };
    visit('/me/notifications');
    const box = await region('Discord');
    expect(await within(box).findByText(/^Your Discord account receives/u)).toBeInTheDocument();
  });

  it("says why Discord's return linked nothing", async () => {
    visit('/me/notifications?discord=discord_not_in_guild');
    const box = await region('Discord');
    expect(await within(box).findByText(/Join this server’s Discord server first/u)).toBeInTheDocument();
  });

  it('says what failed when a start is refused', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/v1/discord/link', () =>
        HttpResponse.json({ error: { type: 'internal', message: 'discord is down' } }, { status: 500 }),
      ),
    );
    visit('/me/notifications');
    const box = await region('Discord');
    await user.click(await within(box).findByRole('button', { name: 'Link my Discord account' }));
    expect(await within(box).findByText('discord is down')).toBeInTheDocument();
  });

  it('points at the administrators while Discord is not set', async () => {
    db.discordConfigured = false;
    visit('/me/notifications');
    const box = await region('Discord');
    expect(
      await within(box).findByText(/An administrator sets the Discord application/u),
    ).toBeInTheDocument();
    expect(within(box).queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks nothing of a server without Discord', async () => {
    without('discord.v1');
    const asked: string[] = [];
    traffic.onRequest((request) => asked.push(new URL(request.url).pathname));
    visit('/me/notifications');
    await region('What you are told about');
    await screen.findByRole('region', { name: 'Slack' });
    expect(screen.queryByRole('region', { name: 'Discord' })).toBeNull();
    expect(asked).not.toContain('/api/v1/discord/link');
  });
});
