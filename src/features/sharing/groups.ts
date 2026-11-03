// SPDX-License-Identifier: AGPL-3.0-only
import type { Group, OrgMember, SharedAccount } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/** A group's name, trimmed, as the server takes it: 1 to 120 characters. */
export const GROUP_NAME_MAX = 120;

const DAY_MS = 86_400_000;

/** A pause offered at a tap: a day or a week from now. */
export type PauseLength = 'day' | 'week';

/** When a pause started now for `length` ends. */
export function pauseEndIn(length: PauseLength, now: Date): string {
  return new Date(now.getTime() + (length === 'day' ? 1 : 7) * DAY_MS).toISOString();
}

/**
 * When a pause until a day picked in the calendar (`YYYY-MM-DD`) ends: as that day does, at midnight where the person
 * is. A day already over, or no day, is no pause.
 */
export function pauseEndOn(day: string, now: Date): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return undefined;
  const end = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1);
  return end.getTime() > now.getTime() ? end.toISOString() : undefined;
}

/** Until when a member of the group is paused, if they are now. */
export function pausedUntil(group: Group, login: string): string | undefined {
  return group.paused?.find((pause) => pause.login === login)?.until;
}

/** The subscriptions a group lends, in its order; one the person cannot read is left out, never shown as an id. */
export function lentAccounts(ids: readonly string[], accounts: readonly SharedAccount[]): SharedAccount[] {
  return ids.flatMap((id) => {
    const account = accounts.find((item) => item.id === id);
    return account === undefined ? [] : [account];
  });
}

/** A member by name and login; a name the server has not been given is empty, or the login again: the login alone. */
export function personOf(member: OrgMember): string {
  return member.name === '' || member.name === member.login
    ? member.login
    : `${member.name} (${member.login})`;
}

/** The group is not there: deleted, or of another organization (the server answers both with 404). */
export function isGone(failure: Error | undefined): boolean {
  return failure !== undefined && isApiFailure(failure) && failure.kind === 'not-found';
}

/** A list with `value` ticked on (added once, at the end) or off. */
export function toggled(list: readonly string[], value: string, on: boolean): string[] {
  const others = list.filter((item) => item !== value);
  return on ? [...others, value] : others;
}
