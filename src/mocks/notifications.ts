// SPDX-License-Identifier: Apache-2.0
import {
  handleGetNotificationPreferences,
  handleGetNotificationSettings,
  handleSendTestPush,
  handleSetNotificationPreferences,
  handleSetNotificationSetting,
} from '@gen/api/msw.gen';
import type { NotificationPreferences, NotificationSetting, PushTestResult } from '@gen/api/types.gen';
import { zNotificationPreferences, zNotificationSettingChange } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import type { z } from 'zod';
import { NOTIFICATION_KIND_WIRES } from '@/mocks/fixtures/notifications';
import { readJson, refusal } from '@/mocks/http';

export interface NotificationsState {
  /** The channels the server offers: `push`, or none while it has no push channel. */
  notificationChannels: string[];
  /** Every switch of the demo person, defaults filled. */
  notificationSwitches: NotificationSetting[];
  /** What the demo person's phone tells them (`/me/notifications`). */
  notificationPreferences: NotificationPreferences;
  /** Who sends the pushes (the instance's `push` settings section): `off` sends nothing. */
  pushProvider: string;
  /** What each of the demo person's phones answers to a test, in order; empty when they have none. */
  pushPhones: PushTestResult[];
  /** When the last test went out, for the server's ten seconds between two. */
  lastPushTestAt: number | undefined;
}

/** The server's ten seconds between two tests (`TEST_WINDOW`). */
export const PUSH_TEST_WINDOW_MS = 10_000;

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIME_ZONE = /^[A-Za-z][\w+-]{0,31}(?:\/[\w+-]{1,32}){0,2}$/;

/** The preferences a body says, with its quiet hours only when it has some. */
function preferencesOf(body: z.infer<typeof zNotificationPreferences>): NotificationPreferences {
  const { requests, decisions, spending, quietHours } = body;
  return quietHours === undefined
    ? { requests, decisions, spending }
    : { requests, decisions, spending, quietHours };
}

function validQuietHours(preferences: NotificationPreferences): boolean {
  const quiet = preferences.quietHours;
  if (quiet === undefined) return true;
  return (
    CLOCK_TIME.test(quiet.start) &&
    CLOCK_TIME.test(quiet.end) &&
    quiet.start !== quiet.end &&
    TIME_ZONE.test(quiet.timeZone)
  );
}

/**
 * The person's notification routes, as ostrom-server serves them: their switches per kind and channel
 * (`/notifications/settings`), their phone preferences (`/me/notifications`) and a test push to their phones
 * (`/notifications/push/test`, 409 `push_off` or `push_no_device`, 429 within ten seconds of the last one).
 */
export function createNotificationsHandlers(
  state: () => NotificationsState,
  now: () => Date = () => new Date(),
): HttpHandler[] {
  const answer = (): { channels: string[]; settings: NotificationSetting[] } => {
    const db = state();
    return {
      channels: db.notificationChannels,
      settings: db.notificationSwitches.filter((setting) =>
        db.notificationChannels.includes(setting.channel),
      ),
    };
  };
  return [
    handleGetNotificationSettings(() => HttpResponse.json(answer())),
    handleSetNotificationSetting(async ({ request }) => {
      const db = state();
      const body = zNotificationSettingChange.safeParse(await readJson(request));
      const known: readonly string[] = NOTIFICATION_KIND_WIRES;
      if (
        !body.success ||
        !db.notificationChannels.includes(body.data.channel) ||
        !known.includes(body.data.kind)
      )
        return refusal(400, 'invalid_notification_setting', 'Unknown channel or kind.');
      const { channel, kind, enabled } = body.data;
      db.notificationSwitches = [
        ...db.notificationSwitches.filter((setting) => setting.channel !== channel || setting.kind !== kind),
        { channel, kind, enabled },
      ];
      return HttpResponse.json(answer());
    }),
    handleGetNotificationPreferences(() => HttpResponse.json(state().notificationPreferences)),
    handleSetNotificationPreferences(async ({ request }) => {
      const body = zNotificationPreferences.safeParse(await readJson(request));
      const preferences = body.success ? preferencesOf(body.data) : undefined;
      if (preferences === undefined || !validQuietHours(preferences))
        return refusal(
          400,
          'invalid_request',
          'Quiet hours need a start and an end (HH:MM, different) and a time zone such as Europe/Paris.',
        );
      state().notificationPreferences = preferences;
      return HttpResponse.json(preferences);
    }),
    handleSendTestPush(() => {
      const db = state();
      if (db.pushProvider === 'off') return refusal(409, 'push_off', 'Push notifications are off.');
      if (db.pushPhones.length === 0) return refusal(409, 'push_no_device', 'No phone push can reach.');
      const at = now().getTime();
      if (db.lastPushTestAt !== undefined && at - db.lastPushTestAt < PUSH_TEST_WINDOW_MS)
        return refusal(429, 'push_test_rate_limited', 'One test every ten seconds.');
      db.lastPushTestAt = at;
      return HttpResponse.json({
        ok: db.pushPhones.some((phone) => phone.status === 'sent'),
        results: db.pushPhones,
      });
    }),
  ];
}
