// SPDX-License-Identifier: AGPL-3.0-only
import { listWaitsOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useServerStatus } from '@/shared/capabilities';
import { hasFeature } from '@/shared/capabilities/model';
import { BADGE_PAGE, countLabel } from './model';

export const BADGE_POLL_MS = 30_000;

export interface WaitBadge {
  /** "3", or "100+" when more wait than one page holds. */
  readonly label: string;
  readonly count: number;
}

/** How many open waits are asked of the viewer, for the navigation; none while the server does not serve waits. */
export function useWaitBadge(): WaitBadge | undefined {
  const status = useServerStatus();
  const enabled = status.kind === 'ready' && hasFeature(status, 'waits.v1');
  const query = useQuery(
    ready(listWaitsOptions({ query: { status: 'open', mine: true, limit: BADGE_PAGE } }), {
      enabled,
      refetchInterval: pollUnlessRefused(BADGE_POLL_MS),
      // The badge only decorates the navigation: a refusal is not retried, nor shown.
      retry: false,
    }),
  );
  const count = query.data?.items.length;
  if (!enabled || count === undefined || count === 0) return undefined;
  return { count, label: countLabel(count, query.data?.next !== undefined) };
}
