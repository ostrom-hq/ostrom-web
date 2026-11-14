// SPDX-License-Identifier: Apache-2.0
import type { NotificationPreferences, NotificationSetting, PushTestResult } from '@gen/api/types.gen';

/** The kinds the server routes (`NotificationKinds` in ostrom-core), as it lists them. */
export const NOTIFICATION_KIND_WIRES = [
  'waiting',
  'turn_completed',
  'turn_failed',
  'session_failed',
] as const;

/** Maya's switches: on, as every switch is until the member turns it off, but a finished turn. */
export function initialNotificationSwitches(): NotificationSetting[] {
  return NOTIFICATION_KIND_WIRES.map((kind) => ({
    channel: 'push',
    kind,
    enabled: kind !== 'turn_completed',
  }));
}

/** The server's defaults for a person who never set any: told of requests and answers, not of spending. */
export function initialNotificationPreferences(): NotificationPreferences {
  return { requests: true, decisions: true, spending: false };
}

/** Maya's two phones, as a test reaches them: one took it, one was forgotten by the provider. */
export function initialPushPhones(): PushTestResult[] {
  return [{ status: 'sent' }, { status: 'unregistered', error: 'unregistered' }];
}
