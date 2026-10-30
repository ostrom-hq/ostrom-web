// SPDX-License-Identifier: AGPL-3.0-only
import { getSessionOptions, listSessionsOptions } from '@gen/api/@tanstack/react-query.gen';
import type { Receipt, Session } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { failureOf } from '@/shared/api/failureOf';
import { tuned } from '@/shared/api/tuned';

/** Open sessions report every few minutes: the list follows them without a reload. */
export const SESSIONS_POLL_MS = 15_000;

export interface SessionListViewModel {
  readonly open: readonly Session[] | undefined;
  readonly ended: readonly Session[] | undefined;
  readonly failure: Error | undefined;
}

export function useSessionList(): SessionListViewModel {
  const open = useQuery(
    tuned(listSessionsOptions({ query: { open: true } }), { refetchInterval: SESSIONS_POLL_MS }),
  );
  const ended = useQuery(listSessionsOptions({ query: { open: false } }));
  return { open: open.data?.items, ended: ended.data?.items, failure: failureOf(open.error ?? ended.error) };
}

export interface SessionViewModel {
  readonly session: Session | undefined;
  readonly receipt: Receipt | undefined;
  readonly failure: Error | undefined;
}

export function useSession(id: string): SessionViewModel {
  const query = useQuery(tuned(getSessionOptions({ path: { id } }), { refetchInterval: SESSIONS_POLL_MS }));
  return { session: query.data?.session, receipt: query.data?.receipt, failure: failureOf(query.error) };
}
