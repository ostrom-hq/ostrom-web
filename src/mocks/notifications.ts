// SPDX-License-Identifier: Apache-2.0
import {
  handleGetNotificationPreferences,
  handleDeletePushDevice,
  handleGetDiscordLink,
  handleGetNotificationSettings,
  handleListPushDevices,
  handleGetSlackLink,
  handleLinkDiscord,
  handleLinkSlack,
  handleSendTestPush,
  handleSetNotificationPreferences,
  handleSetNotificationSetting,
  handleUnlinkDiscord,
  handleUnlinkSlack,
} from '@gen/api/msw.gen';
import type {
  DiscordLink,
  NotificationPreferences,
  NotificationSetting,
  PushDevice,
  PushTestResult,
  SlackLink,
} from '@gen/api/types.gen';
import { zNotificationPreferences, zNotificationSettingChange } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import type { z } from 'zod';
import { CLOCK_TIME, TIME_ZONE } from '@/features/notifications/model';
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
  /** The demo person's phones, the most recently seen first (`/push-devices`). */
  pushDevices: PushDevice[];
  /** What each of the demo person's phones answers to a test, in order; empty when they have none. */
  pushPhones: PushTestResult[];
  /** When the last test went out, for the server's ten seconds between two. */
  lastPushTestAt: number | undefined;
  /** Whether the instance's Slack app is set (the `slack` settings section's bot token and signing secret). */
  slackConfigured: boolean;
  /** The Slack account the demo person's proven address finds in the workspace, or undefined when none does. */
  slackDirectory: string | undefined;
  /** The demo person's Slack link in the organization, or undefined while they linked none. */
  slackLinked: { slackUserId: string; linkedAt: string } | undefined;
  /** Whether the instance's Discord application is set (the `discord` settings section's five fields). */
  discordConfigured: boolean;
  /** The demo person's Discord link in the organization, or undefined while they linked none. */
  discordLinked: { discordUserId: string; discordUsername?: string; linkedAt: string } | undefined;
}

/** The demo person's membership, as the Slack link names it. */
const SLACK_MEMBER_ID = 'member-demo';

/** Discord's authorization page, where a link start sends the browser. */
export const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';

/** The server's ten seconds between two tests (`TEST_WINDOW`). */
export const PUSH_TEST_WINDOW_MS = 10_000;

/** The preferences a body says, with its quiet hours only when it has some. */
function bodyPreferences(body: z.infer<typeof zNotificationPreferences>): NotificationPreferences {
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
      const preferences = body.success ? bodyPreferences(body.data) : undefined;
      if (preferences === undefined || !validQuietHours(preferences))
        return refusal(
          400,
          'invalid_request',
          'Quiet hours need a start and an end (HH:MM, different) and a time zone such as Europe/Paris.',
        );
      state().notificationPreferences = preferences;
      return HttpResponse.json(preferences);
    }),
    handleListPushDevices(() => HttpResponse.json({ items: state().pushDevices })),
    handleDeletePushDevice(({ params }) => {
      const db = state();
      const index = db.pushDevices.findIndex((phone) => phone.id === params.id);
      if (index < 0) return refusal(404, 'push_device_not_found', 'No such phone.');
      // A test reaches the phones in the order they are listed: the phone goes from both.
      db.pushDevices = db.pushDevices.filter((_, at) => at !== index);
      db.pushPhones = db.pushPhones.filter((_, at) => at !== index);
      return new HttpResponse(null, { status: 204 });
    }),
    handleGetSlackLink(() => HttpResponse.json(slackLink(state()))),
    handleLinkSlack(() => {
      const db = state();
      if (!db.slackConfigured) return refusal(409, 'slack_not_configured', 'Slack is not configured.');
      if (db.slackDirectory === undefined)
        return refusal(404, 'slack_user_not_found', 'No Slack account has your proven e-mail address.');
      db.slackLinked = { slackUserId: db.slackDirectory, linkedAt: now().toISOString() };
      return HttpResponse.json(slackLink(db));
    }),
    handleUnlinkSlack(() => {
      state().slackLinked = undefined;
      return new HttpResponse(null, { status: 204 });
    }),
    handleGetDiscordLink(() => HttpResponse.json(discordLink(state()))),
    handleLinkDiscord(() => {
      if (!state().discordConfigured)
        return refusal(409, 'discord_not_configured', 'Discord is not configured.');
      // Discord's sign-in, which a real server's callback answers by sending the browser back with `?discord=`.
      return HttpResponse.json({
        authorizeUrl: `${DISCORD_AUTHORIZE}?response_type=code&client_id=1&scope=identify&state=demo`,
      });
    }),
    handleUnlinkDiscord(() => {
      state().discordLinked = undefined;
      return new HttpResponse(null, { status: 204 });
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

/** The demo person's Slack link, as `GET /slack/link` answers it. */
function slackLink(db: NotificationsState): SlackLink {
  const linked = db.slackLinked;
  return linked === undefined
    ? { memberId: SLACK_MEMBER_ID, configured: db.slackConfigured, linked: false }
    : { memberId: SLACK_MEMBER_ID, configured: db.slackConfigured, linked: true, ...linked };
}

/** The demo person's Discord link, as `GET /discord/link` answers it. */
function discordLink(db: NotificationsState): DiscordLink {
  const linked = db.discordLinked;
  return linked === undefined
    ? { memberId: SLACK_MEMBER_ID, configured: db.discordConfigured, linked: false }
    : { memberId: SLACK_MEMBER_ID, configured: db.discordConfigured, linked: true, ...linked };
}
