// SPDX-License-Identifier: AGPL-3.0-only
import {
  answerApprovalMutation,
  getApprovalOptions,
  getApprovalQueryKey,
  getMeOptions,
  listApprovalsOptions,
  listApprovalsQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import type {
  Approval,
  ApprovalAnswer,
  ApprovalStatus,
  ListApprovalsResponse,
  Me,
  Receipt,
} from '@gen/api/types.gen';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useAuthStore } from '@/shared/auth/authStore';
import { meOf } from '@/shared/auth/me';
import { stillOpen } from './model';
import { useArrivals } from './useArrivals';

/** The queue polls like the prototype: a request must show up on the phone within seconds. */
export const POLL_MS = 2_000;
const DECIDED_POLL_MS = 10_000;
const DECIDED_SHOWN = 10;

/** "Maya Lind (maya)", or the login alone: who an approval from this browser is signed as. */
export function viewerName(me: Me | undefined): string | undefined {
  if (me === undefined) return undefined;
  const name = me.member?.name;
  return name === undefined || name === '' ? me.dev.login : `${name} (${me.dev.login})`;
}

export interface ViewerViewModel {
  readonly login: string | undefined;
  readonly name: string | undefined;
}

export function useViewer(): ViewerViewModel {
  const query = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const me = meOf(query.data);
  return { login: me?.dev.login, name: viewerName(me) };
}

export interface QueueViewModel {
  readonly waiting: readonly Approval[] | undefined;
  /** The server has more waiting requests than the first page shows. */
  readonly more: boolean;
  readonly decided: readonly Approval[] | undefined;
  readonly failure: ApiFailure | Error | undefined;
  readonly fresh: ReadonlySet<string>;
}

/** Asked by status: one page of each holds the latest decisions, whatever is still pending. */
const DECIDED_STATUSES: readonly ApprovalStatus[] = ['approved', 'rejected', 'expired'];

interface DecidedPages {
  readonly decided: readonly Approval[] | undefined;
  readonly error: unknown;
}

function decidedAt(approval: Approval): string {
  return approval.decidedAt ?? approval.expiresAt ?? '';
}

/** The latest decisions first. Stable (module level), so TanStack keeps the result while nothing changes. */
export function combineDecided(
  pages: readonly { readonly data: ListApprovalsResponse | undefined; readonly error: unknown }[],
): DecidedPages {
  const loaded = pages.flatMap((page) => (page.data === undefined ? [] : [page.data.items]));
  return {
    decided:
      loaded.length === 0
        ? undefined
        : loaded
            .flat()
            .sort((a, b) => decidedAt(b).localeCompare(decidedAt(a)))
            .slice(0, DECIDED_SHOWN),
    error: pages.find((page) => page.error !== null)?.error,
  };
}

export function useApprovalsQueue(): QueueViewModel {
  const waiting = useQuery(
    ready(listApprovalsOptions({ query: { mine: true } }), { refetchInterval: pollUnlessRefused(POLL_MS) }),
  );
  const decided = useQueries({
    queries: DECIDED_STATUSES.map((status) =>
      ready(listApprovalsOptions({ query: { status: [status] } }), {
        refetchInterval: pollUnlessRefused(DECIDED_POLL_MS),
      }),
    ),
    combine: combineDecided,
  });
  // Query data keeps its identity while nothing changes (structural sharing): the ids follow it.
  const ids = useMemo(() => waiting.data?.items.map((approval) => approval.id), [waiting.data]);
  const fresh = useArrivals(ids);
  return {
    waiting: waiting.data?.items,
    more: waiting.data?.next !== undefined,
    decided: decided.decided,
    failure: failureOf(waiting.error ?? decided.error),
    fresh,
  };
}

export interface ApprovalViewModel {
  readonly approval: Approval | undefined;
  readonly failure: ApiFailure | Error | undefined;
}

const pollOpen = pollUnlessRefused(POLL_MS);

export function useApproval(id: string): ApprovalViewModel {
  const query = useQuery(
    ready(getApprovalOptions({ path: { id } }), {
      refetchInterval: (polled) => (stillOpen(polled.state.data) ? pollOpen(polled) : false),
    }),
  );
  return { approval: query.data, failure: failureOf(query.error) };
}

export interface ShownApprovalViewModel extends ApprovalViewModel {
  /** A newer version of the open request arrived: the page keeps what the person read until they ask for it. */
  readonly newer: boolean;
  readonly readNewer: () => void;
}

/**
 * The version on screen is the one the person read, and its digest is the one an answer sends: a poll never swaps
 * the proof under their thumb. A decided request, or a newer one they asked for, replaces it.
 */
export function useShownApproval(id: string): ShownApprovalViewModel {
  const { approval: latest, failure } = useApproval(id);
  const [read, setRead] = useState<Approval | undefined>(undefined);
  const newer =
    read !== undefined &&
    latest !== undefined &&
    latest.status === 'pending' &&
    latest.shownDigest !== read.shownDigest;
  if (latest !== undefined && !newer && read !== latest) setRead(latest);
  const readNewer = useCallback(() => {
    setRead(latest);
  }, [latest]);
  return { approval: newer ? read : (latest ?? read), failure, newer, readNewer };
}

export interface SignInNoticeViewModel {
  /** A link to another account than this browser's, waiting for a yes. */
  readonly pending: boolean;
  /** A link that was not a sign-in token. */
  readonly invalid: boolean;
  readonly accept: () => void;
  readonly dismiss: () => void;
}

export function useSignInNotice(): SignInNoticeViewModel {
  const pending = useAuthStore((auth) => auth.pending);
  const notice = useAuthStore((auth) => auth.notice);
  const accept = useAuthStore((auth) => auth.acceptPending);
  const dismiss = useAuthStore((auth) => auth.dismiss);
  return {
    pending: pending !== undefined,
    invalid: pending === undefined && notice !== undefined,
    accept,
    dismiss,
  };
}

/** The server's refusal of this person's answer (they asked for it, or are not an approver). */
export function refusalOf(error: unknown): string | undefined {
  return isApiFailure(error) && error.kind === 'forbidden' ? error.message : undefined;
}

/** The approval changed after it was shown: the answer was not taken, the page reloads it. */
export function changedOf(error: unknown): boolean {
  return isApiFailure(error) && error.code === 'shown_digest_mismatch';
}

export interface AnswerViewModel {
  /** Answers what is on screen: the shown digest goes with it, a refusal carries what the agent should do. */
  readonly answer: (approval: Approval, answer: ApprovalAnswer, comment?: string) => void;
  /** The answer being sent, while the call runs. */
  readonly sending: ApprovalAnswer | undefined;
  readonly refusal: string | undefined;
  readonly changed: boolean;
  readonly failure: ApiFailure | Error | undefined;
  /** The receipt the server signed for this answer, and what the agent was told. */
  readonly receipt: Receipt | undefined;
  readonly comment: string | undefined;
}

export function useAnswerApproval(id: string): AnswerViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...answerApprovalMutation(),
    onSuccess: async (data) => {
      queryClient.setQueryData(getApprovalQueryKey({ path: { id } }), data.approval);
      await queryClient.invalidateQueries({ queryKey: listApprovalsQueryKey() });
    },
    onError: async (error) => {
      if (changedOf(error))
        await queryClient.invalidateQueries({ queryKey: getApprovalQueryKey({ path: { id } }) });
    },
  });
  const { mutate } = mutation;
  const answer = useCallback(
    (approval: Approval, value: ApprovalAnswer, comment?: string) => {
      const body = { answer: value, shownDigest: approval.shownDigest };
      mutate({ path: { id }, body: comment === undefined ? body : { ...body, note: comment } });
    },
    [id, mutate],
  );
  const refusal = refusalOf(mutation.error);
  const changed = changedOf(mutation.error);
  return {
    answer,
    sending: mutation.isPending ? mutation.variables.body.answer : undefined,
    refusal,
    changed,
    failure: refusal === undefined && !changed ? failureOf(mutation.error) : undefined,
    receipt: mutation.data?.receipt,
    comment: mutation.isSuccess ? mutation.variables.body.note : undefined,
  };
}
