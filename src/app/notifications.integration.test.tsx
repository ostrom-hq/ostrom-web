// SPDX-License-Identifier: Apache-2.0
import { handleCapabilities } from '@gen/api/msw.gen';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { demoCapabilities } from '@/mocks/capabilities';
import { FEATURES, type FeatureKey } from '@/shared/capabilities/model';
import { setupMockApp, visit } from '@/test/mockApp';

const { server, db, traffic } = setupMockApp();

async function region(name: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name });
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
    expect(await within(box).findByText('The start and the end must differ.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    const start = within(box).getByLabelText('From');
    await user.clear(start);
    expect(within(box).getByText('Give a start and an end, as hours and minutes.')).toBeInTheDocument();
    await user.type(start, '11:00');
    const zone = within(box).getByLabelText('Time zone');
    await user.clear(zone);
    expect(within(box).getByText('Give a time zone such as Europe/Paris, or UTC.')).toBeInTheDocument();
    await user.type(zone, 'UTC');
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
    expect(await within(box).findByText('not with this token')).toBeInTheDocument();
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
    expect(asked).not.toContain('/api/v1/me/notifications');
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
