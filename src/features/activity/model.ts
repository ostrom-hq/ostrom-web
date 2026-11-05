// SPDX-License-Identifier: AGPL-3.0-only
import type { ActivityItem } from '@gen/api/types.gen';
import { z } from 'zod/mini';
import type { BadgeTone } from '@/shared/ui/Badge';

/** `?repo=`: one repository's sessions, kept in the address so Back and a shared link keep it. */
export const activitySearchSchema = z.object({
  repo: z.catch(z.optional(z.string().check(z.trim(), z.minLength(1))), undefined),
});

/** The kinds the contract names; any other is shown as the server wrote it. */
export const ACTIVITY_KINDS = [
  'session.started',
  'session.ended',
  'gate.requested',
  'gate.decided',
  'check.passed',
  'check.failed',
  'workflow.changed',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function knownKind(kind: string): ActivityKind | undefined {
  return ACTIVITY_KINDS.find((known) => known === kind);
}

/** A failed check stands out; a request waits for someone; the rest is plain. */
export function toneOf(kind: ActivityKind | undefined): BadgeTone {
  switch (kind) {
    case 'check.failed':
      return 'danger';
    case 'gate.requested':
      return 'warning';
    case 'check.passed':
      return 'success';
    case 'session.started':
    case 'session.ended':
    case 'gate.decided':
    case 'workflow.changed':
    case undefined:
      return 'neutral';
  }
}

export type ActivityLink =
  | { readonly to: '/yes/$approvalId'; readonly params: { readonly approvalId: string } }
  | { readonly to: '/sessions/$sessionId'; readonly params: { readonly sessionId: string } };

/** Where a line leads: the request it is about, else its session; a workflow change leads nowhere yet. */
export function linkOf(item: ActivityItem): ActivityLink | undefined {
  if (item.approvalId !== undefined)
    return { to: '/yes/$approvalId', params: { approvalId: item.approvalId } };
  if (item.sessionId !== undefined)
    return { to: '/sessions/$sessionId', params: { sessionId: item.sessionId } };
  return undefined;
}

/** The pages put together, each line once: a line that moved between two reads is not shown twice. */
export function flatten(pages: readonly { readonly items: readonly ActivityItem[] }[]): ActivityItem[] {
  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  for (const page of pages)
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  return items;
}
