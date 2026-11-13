// SPDX-License-Identifier: Apache-2.0
import {
  answerGovernanceConfirmationMutation,
  getGovernanceConfirmationOptions,
  getGovernanceConfirmationQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import type { GovernanceConfirmation, GovernanceConfirmationAnswer } from '@gen/api/types.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { type AnswerNotice, answerNoticeOf } from './model';

/** Someone else may answer it meanwhile (another admin, the CLI's expiry): the page reads it again this often. */
export const POLL_MS = 5_000;
const pollOpen = pollUnlessRefused(POLL_MS);

/** Still waiting for an answer, or not read yet: worth reading again. */
export function stillPending(data: unknown): boolean {
  return !(typeof data === 'object' && data !== null && 'status' in data && data.status !== 'pending');
}

export interface ConfirmationViewModel {
  readonly confirmation: GovernanceConfirmation | undefined;
  readonly failure: ApiFailure | Error | undefined;
  /** 404: no such confirmation in this organization, or not one this person may read. */
  readonly notFound: boolean;
  /** 401: nobody is signed in on this browser. */
  readonly signedOut: boolean;
  /** Reads it again now. */
  readonly refresh: () => void;
}

export function useConfirmation(id: string): ConfirmationViewModel {
  const query = useQuery(
    ready(getGovernanceConfirmationOptions({ path: { id } }), {
      refetchInterval: (polled) => (stillPending(polled.state.data) ? pollOpen(polled) : false),
    }),
  );
  const failure = failureOf(query.error);
  const { refetch } = query;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  return {
    refresh,
    confirmation: query.data,
    failure,
    notFound: isApiFailure(failure) && failure.kind === 'not-found',
    signedOut: isApiFailure(failure) && failure.kind === 'unauthorized',
  };
}

export interface AnswerViewModel {
  readonly answer: (value: GovernanceConfirmationAnswer) => void;
  /** The answer being sent, while the call runs. */
  readonly sending: GovernanceConfirmationAnswer | undefined;
  /** Why the last answer was not taken, in the server's words; the page reads the confirmation again meanwhile. */
  readonly refusal: AnswerRefusal | undefined;
}

export interface AnswerRefusal {
  readonly notice: AnswerNotice;
  readonly message: string;
}

export function useAnswerConfirmation(id: string): AnswerViewModel {
  const queryClient = useQueryClient();
  const key = getGovernanceConfirmationQueryKey({ path: { id } });
  const mutation = useMutation({
    ...answerGovernanceConfirmationMutation(),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
    },
    // Closed, stale, expired or failed: the confirmation changed on the server, and the page shows how it ended.
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const { mutate } = mutation;
  const answer = useCallback(
    (value: GovernanceConfirmationAnswer) => {
      mutate({ path: { id }, body: { answer: value } });
    },
    [id, mutate],
  );
  const error = failureOf(mutation.error);
  return {
    answer,
    sending: mutation.isPending ? mutation.variables.body.answer : undefined,
    refusal: error === undefined ? undefined : { notice: answerNoticeOf(error), message: error.message },
  };
}

/** The time, every second: the countdown to `expiresAt` reads it. */
export function useClock(ms = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, ms);
    return () => {
      clearInterval(timer);
    };
  }, [ms]);
  return now;
}
