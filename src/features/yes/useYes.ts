import {
  decideAskMutation,
  getAskOptions,
  getAskQueryKey,
  getYesQueueOptions,
  getYesQueueQueryKey,
} from '@gen/api/@tanstack/react-query.gen';
import type { Ask, Decision, SelfApprovalRefused, Viewer, YesQueue } from '@gen/api/types.gen';
import { zSelfApprovalRefused } from '@gen/api/zod.gen';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { type ApiFailure, isApiFailure } from '@/shared/api/ApiFailure';
import { useArrivals } from './useArrivals';

/** The page polls like the prototype: a request must show up on the phone within seconds. */
export const POLL_MS = 2_000;

/** A failure the screens can render: typed when the client produced it, generic otherwise. */
export function failureOf(error: unknown): ApiFailure | Error | undefined {
  if (error === null || error === undefined) return undefined;
  if (isApiFailure(error) || error instanceof Error) return error;
  return new Error(String(error));
}

export interface YesQueueViewModel {
  readonly queue: YesQueue | undefined;
  readonly failure: ApiFailure | Error | undefined;
  readonly fresh: ReadonlySet<string>;
}

export function useYesQueue(): YesQueueViewModel {
  const query = useQuery({ ...getYesQueueOptions(), refetchInterval: POLL_MS });
  const fresh = useArrivals(query.data?.pending.map((ask) => ask.id));
  return { queue: query.data, failure: failureOf(query.error), fresh };
}

/** "maya · approver account": who a yes from this browser is signed as, read from the server's queue. */
export function viewerLabel(
  queue: YesQueue | undefined,
  describe: (via: Viewer['via'], login: string) => string,
): string | undefined {
  if (queue === undefined) return undefined;
  return queue.you === undefined ? queue.operator : describe(queue.you.via, queue.you.login);
}

export interface AskViewModel {
  readonly ask: Ask | undefined;
  readonly failure: ApiFailure | Error | undefined;
}

export function useAsk(id: string): AskViewModel {
  const query = useQuery({ ...getAskOptions({ path: { id } }), refetchInterval: POLL_MS });
  return { ask: query.data, failure: failureOf(query.error) };
}

/** The server's refusal of the author's own yes, read from a 403 body that matches the contract. */
export function refusalOf(error: unknown): SelfApprovalRefused | undefined {
  if (!isApiFailure(error) || error.kind !== 'forbidden') return undefined;
  const parsed = zSelfApprovalRefused.safeParse(error.body);
  return parsed.success ? parsed.data : undefined;
}

export interface DecideViewModel {
  readonly decide: (result: Decision) => void;
  /** The answer being signed, while the call runs. */
  readonly signing: Decision | undefined;
  readonly refusal: SelfApprovalRefused | undefined;
  readonly failure: ApiFailure | Error | undefined;
}

export function useDecideAsk(id: string): DecideViewModel {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...decideAskMutation(),
    onSuccess: async (ask) => {
      queryClient.setQueryData(getAskQueryKey({ path: { id } }), ask);
      await queryClient.invalidateQueries({ queryKey: getYesQueueQueryKey() });
    },
  });
  const { mutate } = mutation;
  const decide = useCallback(
    (result: Decision) => {
      mutate({ path: { id }, body: { result } });
    },
    [id, mutate],
  );
  const refusal = refusalOf(mutation.error);
  return {
    decide,
    signing: mutation.isPending ? mutation.variables.body.result : undefined,
    refusal,
    failure: refusal === undefined ? failureOf(mutation.error) : undefined,
  };
}
