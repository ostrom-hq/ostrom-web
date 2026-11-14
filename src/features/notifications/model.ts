// SPDX-License-Identifier: Apache-2.0
import type { NotificationPreferences, NotificationSettings, PushTestResults } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** The kinds a member is told about (`NotificationKinds` in ostrom-core), in the order the screen lists them. */
export const NOTIFICATION_KINDS = ['waiting', 'turn_completed', 'turn_failed', 'session_failed'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Whether the console has words for a kind: a newer server may send one it does not know (CS-04). */
export function isKnownKind(kind: string): kind is NotificationKind {
  return NOTIFICATION_KINDS.some((known) => known === kind);
}

/** One switch of the grid: a kind on a channel. */
export interface SwitchCell {
  readonly channel: string;
  readonly enabled: boolean;
}

/** One row of the grid: a kind, with a switch for each channel the server offers. */
export interface SwitchRow {
  readonly kind: string;
  readonly cells: readonly SwitchCell[];
}

/**
 * The grid of switches: one row per kind the server lists (the known ones first, in their order, then the others as
 * they came), one cell per channel it offers. A switch the server did not send is on, as the server's default is.
 */
export function switchRows(settings: NotificationSettings): SwitchRow[] {
  const listed = [...new Set(settings.settings.map((setting) => setting.kind))];
  const kinds = [
    ...NOTIFICATION_KINDS.filter((kind) => listed.includes(kind)),
    ...listed.filter((kind) => !isKnownKind(kind)),
  ];
  return kinds.map((kind) => ({
    kind,
    cells: settings.channels.map((channel) => ({
      channel,
      enabled:
        settings.settings.find((setting) => setting.kind === kind && setting.channel === channel)?.enabled ??
        true,
    })),
  }));
}

/** How many of the caller's phones took the test push. */
export function sentCount(results: PushTestResults): number {
  return results.results.filter((result) => result.status === 'sent').length;
}

/** Why the server sent no test, when it said why: no provider, no phone, or a test a moment ago. */
export type TestRefusal = 'off' | 'noPhone' | 'rateLimited';

const TEST_REFUSALS: Readonly<Record<string, TestRefusal>> = {
  push_off: 'off',
  push_no_device: 'noPhone',
  push_test_rate_limited: 'rateLimited',
};

/** The refusal a failed test names by its code, or undefined for any other failure (its message is shown). */
export function testRefusalOf(failure: Error): TestRefusal | undefined {
  if (!isApiFailure(failure) || failure.code === undefined) return undefined;
  return TEST_REFUSALS[failure.code];
}

/** What the phone form holds: the three switches and the quiet hours, kept while they are off. */
export interface PhoneForm {
  readonly requests: boolean;
  readonly decisions: boolean;
  readonly spending: boolean;
  readonly quiet: boolean;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
}

/** The three switches of the phone form, in the order it shows them. */
export const PHONE_SWITCHES = ['requests', 'decisions', 'spending'] as const;
export type PhoneSwitch = (typeof PHONE_SWITCHES)[number];

/** The quiet hours the form proposes when the person has none: the night, in their own time zone. */
const NIGHT = { start: '22:00', end: '07:00' } as const;

/** The form for the preferences the server holds; `timeZone` is the browser's, for quiet hours not set yet. */
export function phoneFormOf(preferences: NotificationPreferences, timeZone: string): PhoneForm {
  const quiet = preferences.quietHours;
  return {
    requests: preferences.requests,
    decisions: preferences.decisions,
    spending: preferences.spending,
    quiet: quiet !== undefined,
    start: quiet?.start ?? NIGHT.start,
    end: quiet?.end ?? NIGHT.end,
    timeZone: quiet?.timeZone ?? timeZone,
  };
}

/** The preferences the form says: without quiet hours when they are off. */
export function preferencesOf(form: PhoneForm): NotificationPreferences {
  const { requests, decisions, spending } = form;
  if (!form.quiet) return { requests, decisions, spending };
  return {
    requests,
    decisions,
    spending,
    quietHours: { start: form.start, end: form.end, timeZone: form.timeZone.trim() },
  };
}

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** An IANA name (`Area/Location`, up to three parts) or `UTC`, as the server checks it. */
const TIME_ZONE = /^[A-Za-z][\w+-]{0,31}(?:\/[\w+-]{1,32}){0,2}$/;

/** What keeps quiet hours from being saved, as the server would refuse them; undefined when they may be. */
export type QuietHoursProblem = 'time' | 'same' | 'zone';

export function quietHoursProblem(form: PhoneForm): QuietHoursProblem | undefined {
  if (!form.quiet) return undefined;
  if (!CLOCK_TIME.test(form.start) || !CLOCK_TIME.test(form.end)) return 'time';
  if (form.start === form.end) return 'same';
  if (!TIME_ZONE.test(form.timeZone.trim())) return 'zone';
  return undefined;
}

/** The browser's own time zone, `UTC` when it names none. */
export function browserTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone === '' ? 'UTC' : zone;
}
