// SPDX-License-Identifier: Apache-2.0
import { answerCloudPermission } from '@gen/api/sdk.gen';
import type { CloudSessionResponse } from '@gen/api/types.gen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { idempotencyKey } from '@/shared/api/idempotencyKey';
import { useAnnounced } from '@/shared/capabilities';
import type { TranscriptEvent } from './events';
import {
  acceptedOutcome,
  type AnswerOutcome,
  answersOf,
  cardOf,
  edited,
  failedOutcome,
  draftOf,
  nextQuestion,
  openPermissionRequests,
  otherText,
  type PermissionAnswer,
  type PermissionCard,
  type PermissionDraft,
  previousQuestion,
  reconciledDrafts,
  reopened,
  sameAnswer,
  selectOption,
  selectOther,
} from './permissions';

/** A short message under the card. */
export type PermissionNotice =
  /** A `409`: the request was answered by someone else, expired or ended; its card is gone. */
  | { readonly kind: 'closed'; readonly code: string | undefined }
  /** A `400`: the server refused the answer; the draft stays. */
  | { readonly kind: 'invalid'; readonly code: string | undefined }
  /** A `403 permission_owner_only`: only the owner or an administrator decides a tool use. */
  | { readonly kind: 'denied' }
  /** An accepted answer the agent did not take (an `input` event rejected it): the request is still open. */
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'failure'; readonly reason: string | undefined };

export interface PermissionsViewModel {
  /** The oldest open request, answered first: the agent asked them in this order and their deadlines pass in it. */
  readonly card: PermissionCard | undefined;
  readonly notice: PermissionNotice | undefined;
  readonly selectOption: (question: number, option: number) => void;
  readonly selectOther: (question: number) => void;
  readonly otherText: (question: number, text: string) => void;
  readonly next: () => void;
  readonly previous: () => void;
  /** On the last question: sends every answer in one request. */
  readonly sendAnswers: () => void;
  readonly allow: () => void;
  /** Records the owner's standing approval, then allows this request too. */
  readonly bypass: () => void;
  /** Declines a question or denies a tool use. */
  readonly deny: () => void;
  /** Sends a failed answer again, the same body under the same key: the server never applies it twice. */
  readonly retry: () => void;
}

/** The statuses in which a session takes an answer. */
function answering(session: CloudSessionResponse | undefined): boolean {
  return session === undefined || session.status === 'running';
}

function noticeOf(outcome: Exclude<AnswerOutcome, { kind: 'accepted' | 'retry' }>): PermissionNotice {
  switch (outcome.kind) {
    case 'closed':
      return { kind: 'closed', code: outcome.code };
    case 'invalid':
      return { kind: 'invalid', code: outcome.code };
    case 'refused':
      return outcome.code === 'permission_owner_only'
        ? { kind: 'denied' }
        : { kind: 'failure', reason: outcome.reason ?? outcome.code };
  }
}

/**
 * The permission requests of a conversation (`runners.cloud.permissions.v1`, TeamCode's companion permission card):
 * the oldest open one shown, its answer written and sent, a failed one sent again under the same key.
 */
export function usePermissions(
  sessionId: string,
  session: CloudSessionResponse | undefined,
  events: readonly TranscriptEvent[],
  enableBypass: () => Promise<boolean>,
): PermissionsViewModel {
  const announced = useAnnounced('runners.cloud.permissions.v1');
  const [drafts, setDrafts] = useState<ReadonlyMap<string, PermissionDraft>>(new Map());
  /** Requests the server said were closed (`409`) before the transcript did: their card stays hidden. */
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<PermissionNotice | undefined>(undefined);

  const open = useMemo(
    () =>
      announced && answering(session)
        ? openPermissionRequests(events).filter(
            (request) => request.requestId !== undefined && !closed.has(request.requestId),
          )
        : [],
    [announced, session, events, closed],
  );

  // Each change of the transcript drops the drafts of closed requests, and reopens an answer the agent did not take.
  const shownDrafts = useMemo(() => reconciledDrafts(drafts, open, events), [drafts, open, events]);

  const [first] = open;
  const card = first === undefined ? undefined : cardOf(first, draftOf(shownDrafts, first), open.length - 1);
  /** The card as last shown: what a press acts on, and what a bypass finds once the session took it. */
  const cardRef = useRef(card);
  useEffect(() => {
    cardRef.current = card;
  });

  const deliver = useCallback(
    (current: PermissionCard, answer: PermissionAnswer) => {
      const { requestId } = current;
      // The same answer keeps its key; another one (an edit, Deny after a failed Send) gets a new one.
      const key =
        current.draft.key !== undefined && sameAnswer(current.draft.sending, answer)
          ? current.draft.key
          : idempotencyKey();
      const sending: PermissionDraft = {
        ...current.draft,
        state: 'sending',
        sending: answer,
        key,
        reason: undefined,
        rejected: undefined,
      };
      setDrafts((all) => new Map([...all, [requestId, sending]]));
      setNotice(undefined);
      const run = async (): Promise<void> => {
        let outcome: AnswerOutcome;
        try {
          const { data } = await answerCloudPermission({
            path: { id: sessionId },
            body: {
              requestId,
              behavior: answer.allow ? 'allow' : 'deny',
              ...(answer.answers.length === 0 ? {} : { answers: [...answer.answers] }),
            },
            headers: { 'Idempotency-Key': key },
            throwOnError: true,
          });
          outcome = acceptedOutcome(data);
        } catch (error) {
          outcome = failedOutcome(error);
        }
        // Nothing changes a draft on its way (its card is not editable): the outcome applies to the one sent.
        switch (outcome.kind) {
          case 'accepted': {
            const { inputId } = outcome;
            setDrafts((all) => new Map([...all, [requestId, { ...sending, state: 'sent', inputId }]]));
            return;
          }
          case 'retry': {
            const { reason } = outcome;
            setDrafts((all) => new Map([...all, [requestId, { ...sending, state: 'failed', reason }]]));
            return;
          }
          case 'closed':
            setDrafts((all) => new Map([...all].filter(([id]) => id !== requestId)));
            setClosed((all) => new Set([...all, requestId]));
            setNotice(noticeOf(outcome));
            return;
          case 'invalid':
          case 'refused':
            setDrafts((all) => new Map([...all, [requestId, reopened(sending)]]));
            setNotice(noticeOf(outcome));
            return;
        }
      };
      void run();
    },
    [sessionId],
  );

  const edit = useCallback((change: (current: PermissionCard) => PermissionDraft) => {
    const current = cardRef.current;
    if (current?.editable !== true) return;
    const next = edited(current.draft, change(current));
    setDrafts((all) => new Map([...all, [current.requestId, next]]));
  }, []);

  const sendAnswers = useCallback(() => {
    const current = cardRef.current;
    if (current?.editable !== true || !current.answerable || !current.request.question || !current.last)
      return;
    const answers = answersOf(current.request.questions, current.draft.choices);
    if (answers === undefined) return;
    deliver(current, { requestId: current.requestId, allow: true, answers });
  }, [deliver]);

  const allow = useCallback(() => {
    const current = cardRef.current;
    if (current?.editable !== true || !current.answerable || current.request.question) return;
    deliver(current, { requestId: current.requestId, allow: true, answers: [] });
  }, [deliver]);

  /**
   * "Bypass" on a tool use: records the owner's standing approval on the session, then allows this request too (the
   * server only answers the requests the agent asks after it). If the approval is refused, nothing is allowed.
   */
  const bypass = useCallback(() => {
    const asked = cardRef.current;
    if (asked?.editable !== true || !asked.answerable || asked.request.question) return;
    const run = async (): Promise<void> => {
      if (!(await enableBypass())) return;
      const current = cardRef.current;
      if (current?.requestId === asked.requestId && current.editable)
        deliver(current, { requestId: current.requestId, allow: true, answers: [] });
    };
    void run();
  }, [deliver, enableBypass]);

  const deny = useCallback(() => {
    const current = cardRef.current;
    if (current?.editable !== true) return;
    deliver(current, { requestId: current.requestId, allow: false, answers: [] });
  }, [deliver]);

  const retry = useCallback(() => {
    const current = cardRef.current;
    const answer = current?.draft.sending;
    if (answer === undefined || current?.draft.state !== 'failed') return;
    deliver(current, answer);
  }, [deliver]);

  return {
    card,
    // The agent did not take the last answer: said until the next one goes.
    notice:
      notice ??
      (card?.draft.rejected === undefined ? undefined : { kind: 'rejected', reason: card.draft.rejected }),
    selectOption: useCallback(
      (question: number, option: number) => {
        edit((current) => selectOption(current, question, option));
      },
      [edit],
    ),
    selectOther: useCallback(
      (question: number) => {
        edit((current) => selectOther(current, question));
      },
      [edit],
    ),
    otherText: useCallback(
      (question: number, text: string) => {
        edit((current) => otherText(current, question, text));
      },
      [edit],
    ),
    next: useCallback(() => {
      edit(nextQuestion);
    }, [edit]),
    previous: useCallback(() => {
      edit(previousQuestion);
    }, [edit]),
    sendAnswers,
    allow,
    bypass,
    deny,
    retry,
  };
}
