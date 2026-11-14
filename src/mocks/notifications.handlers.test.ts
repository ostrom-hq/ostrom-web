// SPDX-License-Identifier: Apache-2.0
import {
  zApiError,
  zNotificationPreferences,
  zNotificationSettings,
  zPushTestResults,
} from '@gen/api/zod.gen';
import { getResponse } from 'msw';
import {
  initialNotificationPreferences,
  initialNotificationSwitches,
  initialPushPhones,
} from '@/mocks/fixtures/notifications';
import {
  createNotificationsHandlers,
  type NotificationsState,
  PUSH_TEST_WINDOW_MS,
} from '@/mocks/notifications';

function fresh(): NotificationsState {
  return {
    notificationChannels: ['push'],
    notificationSwitches: initialNotificationSwitches(),
    notificationPreferences: initialNotificationPreferences(),
    pushProvider: 'relay',
    pushPhones: initialPushPhones(),
    lastPushTestAt: undefined,
  };
}

let state = fresh();
let clock = 1_000_000;
const handlers = createNotificationsHandlers(
  () => state,
  () => new Date(clock),
);

async function call(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await getResponse(
    handlers,
    new Request(`http://ostrom.test/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  );
  if (response === undefined) throw new Error('no answer');
  return { status: response.status, body: await response.json() };
}

function typeOf(body: unknown): string {
  return zApiError.parse(body).error.type;
}

describe('the mock notification switches', () => {
  afterEach(() => {
    state = fresh();
  });

  it('lists the channels and every switch', async () => {
    const settings = zNotificationSettings.parse((await call('GET', '/notifications/settings')).body);
    expect(settings.channels).toEqual(['push']);
    expect(settings.settings).toHaveLength(4);
    state.notificationChannels = [];
    expect((await call('GET', '/notifications/settings')).body).toEqual({ channels: [], settings: [] });
  });

  it('turns one switch on or off and answers them all', async () => {
    const answer = await call('PUT', '/notifications/settings', {
      channel: 'push',
      kind: 'turn_completed',
      enabled: true,
    });
    expect(answer.status).toBe(200);
    const settings = zNotificationSettings.parse(answer.body);
    expect(settings.settings.find((one) => one.kind === 'turn_completed')?.enabled).toBe(true);
    expect(settings.settings).toHaveLength(4);
  });

  it('refuses a channel not offered, an unknown kind and a body that is no switch', async () => {
    for (const body of [
      { channel: 'slack', kind: 'waiting', enabled: true },
      { channel: 'push', kind: 'budget', enabled: true },
      '{',
    ]) {
      const answer = await call('PUT', '/notifications/settings', body);
      expect(answer.status).toBe(400);
      expect(typeOf(answer.body)).toBe('invalid_notification_setting');
    }
  });
});

describe('the mock phone preferences', () => {
  afterEach(() => {
    state = fresh();
  });

  it('reads and replaces them, with or without quiet hours', async () => {
    expect(zNotificationPreferences.parse((await call('GET', '/me/notifications')).body)).toEqual({
      requests: true,
      decisions: true,
      spending: false,
    });
    const quiet = { start: '22:00', end: '07:00', timeZone: 'Europe/Paris' };
    const withQuiet = { requests: false, decisions: true, spending: true, quietHours: quiet };
    expect(await call('PUT', '/me/notifications', withQuiet)).toEqual({ status: 200, body: withQuiet });
    expect(state.notificationPreferences).toEqual(withQuiet);
    const without = { requests: true, decisions: true, spending: true };
    expect((await call('PUT', '/me/notifications', without)).body).toEqual(without);
  });

  it('refuses quiet hours the server refuses, and a body that is no preferences', async () => {
    const base = { requests: true, decisions: true, spending: false };
    for (const quietHours of [
      { start: '7', end: '08:00', timeZone: 'UTC' },
      { start: '07:00', end: '25:00', timeZone: 'UTC' },
      { start: '07:00', end: '07:00', timeZone: 'UTC' },
      { start: '07:00', end: '08:00', timeZone: 'Paris time' },
    ]) {
      const answer = await call('PUT', '/me/notifications', { ...base, quietHours });
      expect(answer.status).toBe(400);
      expect(typeOf(answer.body)).toBe('invalid_request');
    }
    expect((await call('PUT', '/me/notifications', '{')).status).toBe(400);
    expect(state.notificationPreferences).toEqual(initialNotificationPreferences());
  });
});

describe('the mock test push', () => {
  afterEach(() => {
    state = fresh();
  });

  it('sends one to each phone, once every ten seconds', async () => {
    const first = await call('POST', '/notifications/push/test');
    expect(zPushTestResults.parse(first.body)).toEqual({ ok: true, results: initialPushPhones() });
    clock += PUSH_TEST_WINDOW_MS - 1;
    const again = await call('POST', '/notifications/push/test');
    expect(again.status).toBe(429);
    expect(typeOf(again.body)).toBe('push_test_rate_limited');
    clock += 1;
    expect((await call('POST', '/notifications/push/test')).status).toBe(200);
  });

  it('says when no phone took it', async () => {
    state.pushPhones = [{ status: 'retry', error: 'unavailable' }];
    expect((await call('POST', '/notifications/push/test')).body).toMatchObject({ ok: false });
  });

  it('refuses while push is off, and without a phone', async () => {
    state.pushProvider = 'off';
    expect(typeOf((await call('POST', '/notifications/push/test')).body)).toBe('push_off');
    state.pushProvider = 'relay';
    state.pushPhones = [];
    const none = await call('POST', '/notifications/push/test');
    expect(none.status).toBe(409);
    expect(typeOf(none.body)).toBe('push_no_device');
  });
});

describe('the mock test push clock', () => {
  it('reads the time of the request by default', async () => {
    const live = createNotificationsHandlers(() => fresh());
    const response = await getResponse(
      live,
      new Request('http://ostrom.test/api/v1/notifications/push/test', { method: 'POST' }),
    );
    expect(response?.status).toBe(200);
  });
});
