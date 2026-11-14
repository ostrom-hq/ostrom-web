// SPDX-License-Identifier: Apache-2.0
import type { WebhookDelivery } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';

/**
 * The event types of the organization's feed a webhook may receive, in the order the form lists them. The contract
 * calls the list open and does not enumerate it (`OrgEvent.type`): these are the types ostrom-server publishes today
 * (`OrgEventType`), and the server refuses any other one (400 `invalid_webhook`).
 */
export const WEBHOOK_EVENT_TYPES = [
  'cloud.wait.created',
  'cloud.wait.resolved',
  'cloud.wait.cancelled',
  'cloud.workflow.run.updated',
  'cloud.todo',
] as const;

export const WEBHOOK_URL_MAX = 2048;
export const WEBHOOK_DESCRIPTION_MAX = 200;

/** How many deliveries the detail page reads: the 50 latest. */
export const DELIVERIES_SHOWN = 50;

/** What the form would send, or why it cannot yet: an `https` URL of at most 2048 characters, one event at least. */
export function webhookDraftProblem(url: string, types: readonly string[]): 'url' | 'types' | undefined {
  const trimmed = url.trim();
  if (trimmed.length > WEBHOOK_URL_MAX || !/^https:\/\/\S+$/i.test(trimmed)) return 'url';
  return types.length === 0 ? 'types' : undefined;
}

/** Adds or takes away an event type, the list kept in the form's order (a type the console does not know last). */
export function toggleEventType(types: readonly string[], type: string, on: boolean): string[] {
  const next = new Set(types);
  if (on) next.add(type);
  else next.delete(type);
  const rank = (value: string): number => {
    const index = WEBHOOK_EVENT_TYPES.findIndex((known) => known === value);
    return index === -1 ? WEBHOOK_EVENT_TYPES.length : index;
  };
  return [...next].sort((a, b) => {
    const order = rank(a) - rank(b);
    return order === 0 ? a.localeCompare(b) : order;
  });
}

/** Whether a failed write is the server saying the webhook changed since it was read (409 `stale_version`). */
export function isStaleVersion(failure: Error | undefined): boolean {
  return isApiFailure(failure) && failure.code === 'stale_version';
}

/** The last answer of a delivery: the HTTP status the receiver gave, then a short error code, or nothing. */
export function lastAnswer(delivery: WebhookDelivery): string {
  return [delivery.lastStatus === undefined ? '' : String(delivery.lastStatus), delivery.lastError ?? '']
    .filter((part) => part !== '')
    .join(' ');
}

/** A time as UTC, to the second: `2026-11-14 09:30:12`. A time the server sent unreadable is shown as it came. */
export function utcTime(iso: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 19).replace('T', ' ') : iso;
}
