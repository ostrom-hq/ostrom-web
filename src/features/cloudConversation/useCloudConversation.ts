// SPDX-License-Identifier: Apache-2.0
import { getCloudSessionOptions, getCloudSessionQueryKey } from '@gen/api/@tanstack/react-query.gen';
import {
  interruptCloudSession,
  listCloudEvents,
  listCloudSubagents,
  sendCloudMessage,
} from '@gen/api/sdk.gen';
import type { CloudSessionResponse, CloudSessionWaitingDto } from '@gen/api/types.gen';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { failureOf } from '@/shared/api/failureOf';
import { idempotencyKey } from '@/shared/api/idempotencyKey';
import { pollUnlessRefused } from '@/shared/api/poll';
import { ready } from '@/shared/api/ready';
import { useViewer } from '@/shared/auth/useViewer';
import { useAnnounced } from '@/shared/capabilities';
import { eventOf, finished, type KnownAgent, knownAgentOf, pageOf, type TranscriptEvent } from './events';
import { AGENT_TOOLS, liveTextOf, type TranscriptItem, transcriptItems } from './items';
import { draftOf, errorOf, failed, type PendingMessage, received, reconciled, validMessage } from './pending';
import { followEvents, StreamRefused } from './stream';
import { type SessionFilesViewModel, useSessionFiles } from './useSessionFiles';
import { threadEvents } from './subagents';
import { EMPTY_TRANSCRIPT, type Transcript, withFeed, withLatest, withLive } from './transcript';

/** The transcript does not carry pauses, resumes or a failed pod: the header is read again while the screen is open. */
const HEADER_MS = 10_000;

/** Without a cursor the server pages from the oldest event: the newest page is the one before any sequence. */
const NEWEST = Number.MAX_SAFE_INTEGER;

/** The statuses after which a session no longer changes. */
export const ENDED: ReadonlySet<string> = new Set(['ended', 'stopped', 'failed', 'terminated']);

/** The `feed` of the main agent's own events (`runners.cloud.transcript.feeds.v1`). */
const MAIN_FEED = 'main';

/** A burst of events reads the server's list of subagents twice at most: once, then once more a second later. */
const AGENTS_MS = 1_000;

export type LiveState = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'stopped';

/** A short message under the composer. */
export type ConversationNotice =
  | { readonly kind: 'nothingRunning' }
  | { readonly kind: 'invalidMessage' }
  /** A file of the message still uploads, or failed: retry or remove it first. */
  | { readonly kind: 'filesNotReady' }
  | { readonly kind: 'failure'; readonly error: Error };

export interface CloudConversationViewModel {
  readonly session: CloudSessionResponse | undefined;
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
  readonly waiting: CloudSessionWaitingDto | undefined;
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
  /** Every event loaded, every thread's, oldest first. */
  readonly events: readonly TranscriptEvent[];
  /** The server pages each agent's events apart and lists subagents (`runners.cloud.transcript.feeds.v1`). */
  readonly feeds: boolean;
  /** The session's subagents as the server tracks them, so their start and state are right without their events loaded. */
  readonly agents: readonly KnownAgent[];
  /** The subagent whose thread shows (its `Agent` call id), undefined for the main agent's. */
  readonly thread: string | undefined;
  readonly openThread: (id: string) => void;
  readonly backToMain: () => void;
  /** The files of the next message (`runners.cloud.files.v1`). */
  readonly files: SessionFilesViewModel;
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
export function runningOf(
  session: CloudSessionResponse | undefined,
  events: readonly TranscriptEvent[],
): boolean {
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
  const files = useSessionFiles(sessionId);
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
  const feeds = useAnnounced('runners.cloud.transcript.feeds.v1');
  const [thread, setThread] = useState<string | undefined>(undefined);
  const [agents, setAgents] = useState<readonly KnownAgent[]>([]);
  const agentsRef = useRef<readonly KnownAgent[]>([]);
  /** The feeds whose newest page is on its way or was read: each is read once. */
  const feedsAsked = useRef(new Set<string>());
  /** A read of the subagents is on its way; `again`: one more is wanted after it. */
  const agentsRead = useRef({ busy: false, again: false });
  const unmounted = useRef(new AbortController());
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

  // A controller per mount: StrictMode's remount gets a fresh one, not the one its simulated unmount aborted.
  useEffect(() => {
    const controller = new AbortController();
    unmounted.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  /**
   * Reads the server's list of subagents: their start, state and step count without their events loaded. A request
   * while one runs asks for one more read after it, a second later at the earliest.
   */
  const refreshAgents = useCallback(() => {
    if (!feeds) return;
    const read = agentsRead.current;
    if (read.busy) {
      read.again = true;
      return;
    }
    read.busy = true;
    const { signal } = unmounted.current;
    /** Asked again meanwhile, and the screen is still open (a read in flight sets `again`). */
    const wanted = (): boolean => read.again && !signal.aborted;
    const run = async (): Promise<void> => {
      do {
        read.again = false;
        try {
          const { data } = await listCloudSubagents({ path: { id: sessionId }, signal, throwOnError: true });
          const known = data.agents.map(knownAgentOf);
          agentsRef.current = known;
          setAgents(known);
        } catch {
          // The panel keeps what the loaded events show; the next change reads again.
        }
        if (wanted())
          await new Promise((resolve) => {
            setTimeout(resolve, AGENTS_MS);
          });
      } while (wanted());
      read.busy = false;
    };
    void run();
  }, [feeds, sessionId]);

  /** An event after which the server's list of subagents may have changed: a subagent started, answered, or the tasks moved. */
  const changesAgents = useCallback((event: TranscriptEvent): boolean => {
    const listed = (id: string | undefined): boolean => agentsRef.current.some((agent) => agent.id === id);
    if (event.kind === 'toolCall')
      return (
        AGENT_TOOLS.has(event.name) || (event.parentToolUseId !== undefined && listed(event.parentToolUseId))
      );
    if (event.kind === 'toolResult')
      return (
        listed(event.id) ||
        (event.parentToolUseId === undefined &&
          events.current.some(
            (known) => known.kind === 'toolCall' && known.id === event.id && AGENT_TOOLS.has(known.name),
          ))
      );
    return event.kind === 'tasks' || (event.kind === 'turn' && finished(event.phase));
  }, []);

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
            // With feeds the conversation opens on the main agent's own events: a subagent's burst of steps no
            // longer pushes the main agent's out of the first page.
            query: feeds ? { before: NEWEST, feed: MAIN_FEED } : { before: NEWEST },
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
          refreshAgents();
        }
        let cut = false;
        const end = await followEvents(
          sessionId,
          newest.current,
          {
            opened: () => {
              setState((current) => ({ ...current, live: 'live' }));
              // Back after a cut: the session may have been paused or resumed meanwhile.
              if (cut) {
                refreshHeader();
                refreshAgents();
              }
              cut = false;
            },
            event: (cloud) => {
              const event = eventOf(cloud);
              newest.current = Math.max(newest.current, event.seq);
              merge((transcript) => withLive(transcript, event));
              if (changesAgents(event)) refreshAgents();
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
  }, [conversation, sessionId, attempt, merge, refreshHeader, feeds, refreshAgents, changesAgents]);

  /** The newest page of the subagent `feed`, read once: a feed has its own cursor, the main agent's does not move. */
  const loadFeed = useCallback(
    (feed: string) => {
      if (!feeds || feedsAsked.current.has(feed)) return;
      feedsAsked.current.add(feed);
      const { signal } = unmounted.current;
      const run = async (): Promise<void> => {
        try {
          const { data } = await listCloudEvents({
            path: { id: sessionId },
            query: { before: NEWEST, feed },
            signal,
            throwOnError: true,
          });
          const page = pageOf(data);
          merge((transcript) => withFeed(transcript, feed, page));
        } catch {
          // Opened again, it is read again; meanwhile the thread shows what the loaded events hold.
          feedsAsked.current.delete(feed);
        }
      };
      void run();
    },
    [feeds, sessionId, merge],
  );

  /** Shows the subagent `id`'s thread in place of the main agent's. */
  const openThread = useCallback(
    (id: string) => {
      setThread(id);
      loadFeed(id);
    },
    [loadFeed],
  );

  const backToMain = useCallback(() => {
    setThread(undefined);
  }, []);

  const deliver = useCallback(
    async (message: PendingMessage) => {
      let next: PendingMessage;
      try {
        const { data } = await sendCloudMessage({
          path: { id: sessionId },
          body:
            message.files.length === 0
              ? { text: message.text, clientMessageId: message.clientMessageId }
              : {
                  text: message.text,
                  clientMessageId: message.clientMessageId,
                  fileIds: message.files.map((file) => file.id),
                },
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

  const { uploaded, clear: clearFiles } = files;
  /**
   * Shows the message at once, then sends it with the uploaded files; the draft and the files are cleared only once it
   * is on its way. While a file still uploads or failed, nothing is sent.
   */
  const send = useCallback(() => {
    const attached = uploaded();
    if (attached === undefined) {
      setNotice({ kind: 'filesNotReady' });
      return;
    }
    const text = draft.trim();
    if (!validMessage(text, attached.length > 0)) {
      setNotice({ kind: 'invalidMessage' });
      return;
    }
    const message = draftOf(text, idempotencyKey(), attached);
    // A new message replaces what the last action said.
    setNotice(undefined);
    setDraft('');
    setPending((current) => [...current, message]);
    if (attached.length > 0) clearFiles();
    void deliver(message);
  }, [draft, deliver, uploaded, clearFiles]);

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

  // With feeds each thread shows its own events, its subagents as cards; without, the steps show nested, as before.
  const shown = feeds ? thread : undefined;
  const items = useMemo(
    () => transcriptItems(feeds ? threadEvents(state.transcript.events, shown) : state.transcript.events),
    [state.transcript.events, feeds, shown],
  );
  const liveText = useMemo(
    () => liveTextOf(state.transcript.events, shown),
    [state.transcript.events, shown],
  );
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
    canSend: !sessionEnded && files.ready && (draft.trim() !== '' || files.files.length > 0),
    running,
    waiting: sessionEnded ? undefined : (session?.waiting ?? undefined),
    ended: sessionEnded,
    interrupting,
    notice,
    send,
    retryMessage,
    discard,
    interrupt,
    retry,
    events: state.transcript.events,
    feeds,
    agents,
    thread: shown,
    openThread,
    backToMain,
    files,
  };
}
