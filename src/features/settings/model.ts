// SPDX-License-Identifier: AGPL-3.0-only
import type { AuthSession, Device } from '@gen/api/types.gen';
import { nameProblem } from '@/shared/org/slug';

/** A name the server takes (`validOrgName`) and not the one it already has. */
export function renameProblem(
  typed: string,
  current: string,
): 'empty' | 'long' | 'control' | 'same' | undefined {
  return nameProblem(typed) ?? (typed.trim() === current ? 'same' : undefined);
}

/** The deletion is confirmed by the short name typed again, exactly as the server compares it. */
export function deletionConfirmed(typed: string, slug: string): boolean {
  return typed === slug;
}

/** This browser first, then the most recently seen; a session never seen since sign-in by when it started. */
export function sortSessions(sessions: readonly AuthSession[]): AuthSession[] {
  const seen = (session: AuthSession): number => Date.parse(session.lastSeenAt ?? session.createdAt);
  return [...sessions].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return seen(b) - seen(a);
  });
}

/** The time zone this browser shows every time in: the organization has none of its own yet. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The most recently seen first; a workstation never seen since it signed in last, by name. */
export function sortDevices(devices: readonly Device[]): Device[] {
  const seen = (device: Device): number =>
    device.lastSeenAt === undefined ? 0 : Date.parse(device.lastSeenAt);
  return [...devices].sort((a, b) => {
    const byLastSeen = seen(b) - seen(a);
    return byLastSeen === 0 ? a.name.localeCompare(b.name) : byLastSeen;
  });
}

/**
 * The person's own workstations: those of `ostrom login`. An elevated token of `ostrom login --admin` is bound to one
 * organization, and the list read in an organization holds every member's for an owner or an admin: they stay on
 * that organization's settings.
 */
export function personalDevices(devices: readonly Device[]): Device[] {
  return devices.filter((device) => device.kind !== 'admin');
}

/** How a person signs in with GitHub, in the account's `providers`. */
export const GITHUB = 'github';

/**
 * What a key calls for a CI (contract `createServiceKey`): it acts for the organization, each use audited, and holds
 * only these. The server refuses them mixed with the member scopes.
 */
export const SERVICE_KEY_CI_SCOPES = [
  { scope: 'sessions:write', label: 'sessionsWrite' },
  { scope: 'rules:read', label: 'rulesRead' },
] as const;

/**
 * What a key does as the person who created it, within the scope (the server serves them when it lists
 * `servicekeys.scopes.v1`): never an administrator's rights, and the key stops when its creator leaves.
 */
export const SERVICE_KEY_MEMBER_SCOPES = [
  { scope: 'inference:use', label: 'inferenceUse' },
  { scope: 'mcp:use', label: 'mcpUse' },
  { scope: 'usage:read', label: 'usageRead' },
  { scope: 'cloud:read', label: 'cloudRead' },
  { scope: 'cloud:write', label: 'cloudWrite' },
  { scope: 'artifacts:read', label: 'artifactsRead' },
  { scope: 'artifacts:write', label: 'artifactsWrite' },
] as const;

/**
 * The scopes reserved to an owner or an admin: the key works only while its creator still is one. `team:read` is a
 * read-only view of the organization, `cloud:admin` an administrator's rights over every cloud session.
 */
export const SERVICE_KEY_RESERVED_SCOPES = [
  { scope: 'team:read', label: 'teamRead' },
  { scope: 'cloud:admin', label: 'cloudAdmin' },
] as const;

/** Every scope a key may carry, in the catalogue's order. */
export const SERVICE_KEY_SCOPES = [
  ...SERVICE_KEY_CI_SCOPES,
  ...SERVICE_KEY_MEMBER_SCOPES,
  ...SERVICE_KEY_RESERVED_SCOPES,
] as const;

export type ServiceKeyScopeItem = (typeof SERVICE_KEY_SCOPES)[number];

/** Whether a scope is one a CI calls: the CI scopes and the others are never on one key. */
export function isCiServiceKeyScope(scope: string): boolean {
  return SERVICE_KEY_CI_SCOPES.some((item) => item.scope === scope);
}

export const SERVICE_KEY_NAME_MAX = 100;

/**
 * The lifetimes offered to a key, in days (the server takes 1 to 366); `null` is a key that works until deleted. 90
 * days is the default: a key acts for the whole organization, so it ends unless someone chose otherwise.
 */
export const SERVICE_KEY_LIFETIMES = [30, 90, 366, null] as const;
export type ServiceKeyLifetime = (typeof SERVICE_KEY_LIFETIMES)[number];
export const DEFAULT_SERVICE_KEY_LIFETIME: ServiceKeyLifetime = 90;

/** The lifetime a select's value stands for: anything else reads as the default. */
export function serviceKeyLifetimeOf(value: string): ServiceKeyLifetime {
  // Not `find(…) ?? default`: the lifetime found may be `null`, a key that never expires.
  for (const days of SERVICE_KEY_LIFETIMES) if (String(days) === value) return days;
  return DEFAULT_SERVICE_KEY_LIFETIME;
}

/** Why the form cannot send yet: a name of 1 to 100 characters and at least one scope. */
export function serviceKeyDraftProblem(
  name: string,
  scopes: readonly string[],
): 'name' | 'scopes' | undefined {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > SERVICE_KEY_NAME_MAX) return 'name';
  return scopes.length === 0 ? 'scopes' : undefined;
}

/**
 * Adds or takes away a scope, kept in the catalogue's order. A CI scope and a member scope are never on one key:
 * adding one of the other kind replaces what was ticked.
 */
export function toggleServiceKeyScope(scopes: readonly string[], scope: string, on: boolean): string[] {
  const kept = on
    ? scopes.filter((item) => isCiServiceKeyScope(item) === isCiServiceKeyScope(scope))
    : scopes;
  const next = new Set(kept);
  if (on) next.add(scope);
  else next.delete(scope);
  return SERVICE_KEY_SCOPES.map((item) => item.scope).filter((item) => next.has(item));
}
