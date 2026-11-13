// SPDX-License-Identifier: AGPL-3.0-only
import {
  answerWaitMutation,
  cancelWaitMutation,
  getWaitOptions,
  getWaitQueryKey,
  listWaitsInfiniteOptions,
} from '@gen/api/@tanstack/react-query.gen';
import type { Wait } from '@gen/api/types.gen';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { useOrgMembers } from '@/shared/org/members';
import { useCurrentOrg } from '@/shared/org/useCurrentOrg';
import { type Answer, isMemberId, isViewer, PAGE, type WaitFilter, type WaitScope } from './model';

/**
 * The console has no event feed for waits (the server's `cloud.wait.*` events ride the CLI's and the apps' feed): the
 * list and the badge read again every so often instead, and a wait open on screen follows its own state.
 */
export const WAITS_POLL_MS = 15_000;
const pollList = pollUnlessRefused(WAITS_POLL_MS);

/** Polls the list while only its first page is read: each poll would read every older page again. */
export function firstPagePoll(query: {
  readonly state: { readonly error: unknown; readonly data?: unknown };
}): number | false {
  const { data } = query.state;
  const pages =
    typeof data === 'object' && data !== null && 'pages' in data && Array.isArray(data.pages)
      ? data.pages.length
      : 0;
  return pages > 1 ? false : pollList(query);
}

/** Whether a query key is one of the wait lists (any filter, any scope, any page size). */
export function isWaitList(key: readonly unknown[]): boolean {
  const [head] = key;
  return typeof head === 'object' && head !== null && '_id' in head && head._id === 'listWaits';
}

export interface WaitListViewModel {
  readonly waits: readonly Wait[] | undefined;
  readonly failure: Error | undefined;
  readonly more: boolean;
  readonly loadingMore: boolean;
  /** Why the last read failed once some waits were read: they stay on screen. */
  readonly moreFailure: Error | undefined;
  readonly loadMore: () => void;
}

export function useWaitList(filter: WaitFilter, scope: WaitScope): WaitListViewModel {
  const query = useInfiniteQuery({
    ...ready(
      listWaitsInfiniteOptions({
        query:
          scope === 'mine' ? { status: filter, mine: true, limit: PAGE } : { status: filter, limit: PAGE },
      }),
      { refetchInterval: firstPagePoll },
    ),
    initialPageParam: {},
    getNextPageParam: (last) => last.next,
  });
  const waits = useMemo(() => query.data?.pages.flatMap((page) => page.items), [query.data]);
  const { fetchNextPage } = query;
  const read = query.data !== undefined;
  const error = failureOf(query.error);
  return {
    waits,
    failure: read ? undefined : error,
    more: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    moreFailure: read ? error : undefined,
    loadMore: () => {
      void fetchNextPage();
    },
  };
}

export interface WaitViewModel {
  readonly wait: Wait | undefined;
  readonly failure: ApiFailure | Error | undefined;
  /** 404: no such wait, or not one this person may read. */
  readonly notFound: boolean;
}

export function useWait(id: string): WaitViewModel {
  const query = useQuery(
    ready(getWaitOptions({ path: { id } }), {
      refetchInterval: (polled) => {
        const data: unknown = polled.state.data;
        const closed =
          typeof data === 'object' && data !== null && 'status' in data && data.status !== 'open';
        return closed ? false : pollList(polled);
      },
    }),
  );
  const failure = failureOf(query.error);
  return {
    wait: query.data,
    failure,
    notFound: isApiFailure(failure) && failure.kind === 'not-found',
  };
}

/** What a refused write means for the person. */
export type Refusal = 'closed' | 'invalid' | 'other';

export interface Refused {
  readonly kind: Refusal;
  /** The server's words. */
  readonly message: string;
}

/** 409 (`wait_closed`, `answer_through_session`): it ended meanwhile; 400: the server's message; else as sent. */
export function refusalOf(failure: Error): Refused {
  if (isApiFailure(failure)) {
    if (failure.kind === 'conflict') return { kind: 'closed', message: failure.message };
    if (failure.kind === 'bad-request') return { kind: 'invalid', message: failure.message };
  }
  return { kind: 'other', message: failure.message };
}

export interface WritesViewModel {
  readonly sending: boolean;
  /** Why the last write was refused; a later write, of either kind, clears it. */
  readonly refused: Refused | undefined;
  readonly answer: (answer: Answer) => void;
  readonly cancel: () => void;
}

function useAfterWrite(id: string): {
  readonly settle: (wait: Wait) => void;
  readonly refresh: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const key = getWaitQueryKey({ path: { id } });
  const lists = useCallback(
    async () => queryClient.invalidateQueries({ predicate: (query) => isWaitList(query.queryKey) }),
    [queryClient],
  );
  return {
    settle: (wait) => {
      queryClient.setQueryData(key, wait);
      void lists();
    },
    // Closed meanwhile (409) or refused (400): read the wait again, so the screen shows how it stands.
    refresh: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: key }), lists()]);
    },
  };
}

/** Answering and cancelling one wait: one refusal at a time, the latest write's. */
export function useWaitWrites(id: string): WritesViewModel {
  const { settle, refresh } = useAfterWrite(id);
  const answering = useMutation({ ...answerWaitMutation(), onSuccess: settle, onError: refresh });
  const cancelling = useMutation({ ...cancelWaitMutation(), onSuccess: settle, onError: refresh });
  const { mutate: sendAnswer, reset: resetAnswer } = answering;
  const { mutate: sendCancel, reset: resetCancel } = cancelling;
  const error = failureOf(answering.error ?? cancelling.error);
  return {
    sending: answering.isPending || cancelling.isPending,
    refused: error === undefined ? undefined : refusalOf(error),
    answer: useCallback(
      (answer: Answer) => {
        resetCancel();
        sendAnswer({ path: { id }, body: { action: answer.action, values: answer.values } });
      },
      [id, sendAnswer, resetCancel],
    ),
    cancel: useCallback(() => {
      resetAnswer();
      sendCancel({ path: { id } });
    }, [id, sendCancel, resetAnswer]),
  };
}

export interface Me {
  readonly memberId: string | undefined;
  readonly login: string | undefined;
  readonly canManage: boolean;
}

export interface PeopleViewModel {
  readonly me: Me;
  /** A member id or username as a name: "you", their name, else what the server wrote. */
  readonly nameOf: (who: string) => string;
}

/** Who the viewer is and how to name the people a wait mentions; members that cannot be read stay as written. */
export function usePeople(): PeopleViewModel {
  const viewer = useViewer();
  const { org } = useCurrentOrg();
  const members = useOrgMembers(org?.id ?? '', {
    enabled: org !== undefined,
    staleTime: 60_000,
    retry: false,
  }).members;
  const me = useMemo(
    () => ({ memberId: viewer.memberId, login: viewer.login, canManage: viewer.canManage }),
    [viewer.memberId, viewer.login, viewer.canManage],
  );
  const { t } = useTranslation();
  return {
    me,
    nameOf: (who) => {
      if (isViewer(who, me)) return t('waits.you');
      const found = members?.find(
        (member) => member.id === who || member.login.toLowerCase() === who.toLowerCase(),
      );
      if (found === undefined) return isMemberId(who) ? t('waits.detail.teammate') : who;
      return found.name === '' ? found.login : found.name;
    },
  };
}
