// SPDX-License-Identifier: Apache-2.0
import { getCloudSessionOptions, getCloudSessionQueryKey } from '@gen/api/@tanstack/react-query.gen';
import { interruptCloudSession, listCloudEvents, sendCloudMessage } from '@gen/api/sdk.gen';
import type { CloudSession, CloudSessionWaiting } from '@gen/api/types.gen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { idempotencyKey } from '@/shared/api/idempotencyKey';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { useAnnounced } from '@/shared/capabilities';
import { eventOf, pageOf, type TranscriptEvent } from './events';
import { liveTextOf, type TranscriptItem, transcriptItems } from './items';
import { draftOf, errorOf, failed, type PendingMessage, received, reconciled, validMessage } from './pending';
import { followEvents, StreamRefused } from './stream';
import { EMPTY_TRANSCRIPT, type Transcript, withLatest, withLive } from './transcript';

/** The transcript does not carry pauses, resumes or a failed pod: the header is read again while the screen is open. */
const HEADER_MS = 10_000;

/** Without a cursor the server pages from the oldest event: the newest page is the one before any sequence. */
const NEWEST = Number.MAX_SAFE_INTEGER;

/** The statuses after which a session no longer changes. */
const ENDED: ReadonlySet<string> = new Set(['ended', 'stopped', 'failed', 'terminated']);

export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'stopped';

/** A short message under the composer. */
export type ConversationNotice =
  | { readonly kind: 'nothingRunning' }
  | { readonly kind: 'invalidMessage' }
  | { readonly kind: 'failure'; readonly error: Error };

export interface CloudConversationViewModel {
  readonly session: CloudSession | undefined;
  /** The viewer's member id: a message another member wrote says so. */
  readonly memberId: string | undefined;
  /** Why the header could not be read; with `gone`, the session is gone or no longer visible. */
  readonly sessionFailure: Error | undefined;
  readonly gone: boolean;
  /** The server serves conversations (`runners.cloud.conversation.v1`) and this session is one. */
  readonly conversation: boolean;
  readonly items: readonly TranscriptItem[];
  /** What the agent is writing now (`runners.cloud.transcript.live.v1`), not final yet. */
  readonly liveText: string | undefined;
  readonly loaded: boolean;
  readonly live: LiveState;
  /** A failure that ended the stream or its first load. */
  readonly error: Error | undefined;
  /** Messages sent from here that the transcript does not show yet, or that failed. */
  readonly pending: readonly PendingMessage[];
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  readonly canSend: boolean;
  /** A turn is running: the session runs and its last loaded `turn` event is `started`. */
  readonly running: boolean;
  /** The agent waits for a person (`runners.cloud.permissions.v1`): a tool use to allow, or a question. */
  readonly waiting: CloudSessionWaiting | undefined;
  readonly ended: boolean;
  readonly interrupting: boolean;
  readonly notice: ConversationNotice | undefined;
  readonly send: () => void;
  /** Sends a failed message again under the same id: the server never queues it twice. */
  readonly retryMessage: (message: PendingMessage) => void;
  readonly discard: (clientMessageId: string) => void;
  readonly interrupt: () => void;
  /** After the stream stopped on a failure: follow again. */
  readonly retry: () => void;
}

interface FollowState {
  readonly transcript: Transcript;
  readonly loaded: boolean;
  readonly live: LiveState;
  readonly error: Error | undefined;
  readonly gone: boolean;
}

const INITIAL: FollowState = {
  transcript: EMPTY_TRANSCRIPT,
  loaded: false,
  live: 'stopped',
  error: undefined,
  gone: false,
};

/** Refused for good: the session is gone, or the caller may no longer read it. */
function goneBy(error: unknown): boolean {
  const status =
    error instanceof StreamRefused ? error.status : isApiFailure(error) ? error.status : undefined;
  return status === 403 || status === 404;
}

/** A turn is running: the session runs and the last loaded `turn` event started one. */
export function runningOf(session: CloudSession | undefined, events: readonly TranscriptEvent[]): boolean {
  const last = events.findLast((event) => event.kind === 'turn');
  const started = last?.kind === 'turn' && last.phase === 'started';
  return started && (session === undefined || session.status === 'running');
}

/**
 * One conversation session (TeamCode's companion `SessionViewModel`): its header read again every ten seconds, the
 * newest page of its transcript, then the live stream after the newest event while the screen is open. Events merge
 * by sequence, so nothing shows twice; messages sent from here show at once and leave once the transcript has them.
 */
export function useCloudConversation(sessionId: string): CloudConversationViewModel {
  const queryClient = useQueryClient();
  const announced = useAnnounced('runners.cloud.conversation.v1');
  const header = useQuery({
    ...ready(getCloudSessionOptions({ path: { id: sessionId } }), { retry: false }),
    // An ended session no longer changes: nothing to read again.
    refetchInterval: (query) =>
      query.state.data !== undefined && ENDED.has(query.state.data.status)
        ? false
        : pollUnlessRefused(HEADER_MS)(query),
  });
  const session = header.data;
  const { memberId } = useViewer();
  const conversation = announced && session?.mode === 'conversation';
  const [state, setState] = useState<FollowState>(INITIAL);
  const [pending, setPending] = useState<readonly PendingMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<ConversationNotice | undefined>(undefined);
  const [interrupting, setInterrupting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** The newest sequence known: following resumes after it, a retry included. */
  const newest = useRef(0);
  const loaded = useRef(false);
  const ended = useRef(false);
  const events = useRef<readonly TranscriptEvent[]>([]);

  const refreshHeader = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getCloudSessionQueryKey({ path: { id: sessionId } }) });
  }, [queryClient, sessionId]);

  const merge = useCallback((change: (transcript: Transcript) => Transcript) => {
    setState((current) => {
      const transcript = change(current.transcript);
      return { ...current, transcript };
    });
  }, []);

  // Each merge reconciles the pending messages against the events the screen holds.
  useEffect(() => {
    events.current = state.transcript.events;
    setPending((current) => reconciled(current, state.transcript.events));
  }, [state.transcript.events]);

  useEffect(() => {
    if (!conversation || ended.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    setState((current) => ({ ...current, live: 'connecting', error: undefined }));
    const run = async (): Promise<void> => {
      try {
        if (!loaded.current) {
          const { data } = await listCloudEvents({
            path: { id: sessionId },
            query: { before: NEWEST },
            signal,
            throwOnError: true,
          });
          const page = pageOf(data);
          loaded.current = true;
          newest.current = Math.max(newest.current, page.lastSeq, ...page.events.map((event) => event.seq));
          setState((current) => ({
            ...current,
            transcript: withLatest(current.transcript, page),
            loaded: true,
          }));
        }
        let cut = false;
        const end = await followEvents(
          sessionId,
          newest.current,
          {
            opened: () => {
              setState((current) => ({ ...current, live: 'live' }));
              // Back after a cut: the session may have been paused or resumed meanwhile.
              if (cut) refreshHeader();
              cut = false;
            },
            event: (cloud) => {
              const event = eventOf(cloud);
              newest.current = Math.max(newest.current, event.seq);
              merge((transcript) => withLive(transcript, event));
            },
            reconnecting: () => {
              cut = true;
              setState((current) => ({ ...current, live: 'reconnecting' }));
            },
          },
          { signal },
        );
        if (end === undefined) return;
        // Everything was sent: nothing more to follow. Access withdrawn may come back: Try again stays offered.
        if (end === 'ended') ended.current = true;
        setState((current) => ({
          ...current,
          live: end === 'ended' ? 'ended' : 'stopped',
          error: end === 'denied' ? new StreamRefused(403, 'access_denied') : undefined,
        }));
        // The final state is whatever the header reads.
        refreshHeader();
      } catch (error) {
        if (signal.aborted) return;
        setState((current) => ({
          ...current,
          live: 'stopped',
          error: failureOf(error),
          gone: goneBy(error),
        }));
      }
    };
    void run();
    return () => {
      controller.abort();
    };
  }, [conversation, sessionId, attempt, merge, refreshHeader]);

  const deliver = useCallback(
    async (message: PendingMessage) => {
      let next: PendingMessage;
      try {
        const { data } = await sendCloudMessage({
          path: { id: sessionId },
          body: { text: message.text, clientMessageId: message.clientMessageId },
          throwOnError: true,
        });
        next = received(message, data);
      } catch (error) {
        next = failed(message, error);
      }
      setPending((current) =>
        reconciled(
          current.map((item) => (item.clientMessageId === message.clientMessageId ? next : item)),
          events.current,
        ),
      );
      // A paused session woke for it: the header changes state.
      if (next.woke) refreshHeader();
    },
    [sessionId, refreshHeader],
  );

  const send = useCallback(() => {
    const text = draft.trim();
    if (!validMessage(text)) {
      setNotice({ kind: 'invalidMessage' });
      return;
    }
    const message = draftOf(text, idempotencyKey());
    // A new message replaces what the last action said.
    setNotice(undefined);
    setDraft('');
    setPending((current) => [...current, message]);
    void deliver(message);
  }, [draft, deliver]);

  const retryMessage = useCallback(
    (message: PendingMessage) => {
      const sending: PendingMessage = { ...message, state: 'sending', reason: undefined };
      setPending((current) =>
        current.map((item) => (item.clientMessageId === message.clientMessageId ? sending : item)),
      );
      void deliver(sending);
    },
    [deliver],
  );

  const discard = useCallback((clientMessageId: string) => {
    setPending((current) =>
      current.filter((item) => item.clientMessageId !== clientMessageId || item.state === 'sending'),
    );
  }, []);

  // Interrupt is held while one is on its way: a single interruption until the server answered it.
  const interrupt = useCallback(() => {
    setInterrupting(true);
    setNotice(undefined);
    const run = async (): Promise<void> => {
      try {
        await interruptCloudSession({ path: { id: sessionId }, throwOnError: true });
      } catch (error) {
        setNotice(
          isApiFailure(error) && error.code === 'nothing_to_interrupt'
            ? { kind: 'nothingRunning' }
            : { kind: 'failure', error: errorOf(error) },
        );
      } finally {
        // One interruption at a time, until the server answered it.
        setInterrupting(false);
      }
    };
    void run();
  }, [sessionId]);

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const items = useMemo(() => transcriptItems(state.transcript.events), [state.transcript.events]);
  const liveText = useMemo(() => liveTextOf(state.transcript.events, undefined), [state.transcript.events]);
  const running = runningOf(session, state.transcript.events);
  const sessionEnded = session !== undefined && ENDED.has(session.status);
  const headerGone = goneBy(header.error);
  return {
    session,
    memberId,
    sessionFailure: failureOf(header.error),
    gone: headerGone || state.gone,
    conversation,
    items,
    liveText,
    loaded: state.loaded,
    live: state.live,
    error: state.error,
    pending,
    draft,
    setDraft,
    canSend: !sessionEnded && draft.trim() !== '',
    running,
    waiting: sessionEnded ? undefined : session?.waiting,
    ended: sessionEnded,
    interrupting,
    notice,
    send,
    retryMessage,
    discard,
    interrupt,
    retry,
  };
}
