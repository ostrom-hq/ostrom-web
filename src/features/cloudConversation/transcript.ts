// SPDX-License-Identifier: Apache-2.0
import type { TranscriptEvent, TranscriptPage } from './events';

/**
 * The events a session screen shows: history pages and live events merged by sequence, each once, in order (TeamCode's
 * companion `Transcript`). Pure: every merge returns a new transcript.
 */
export interface Transcript {
  readonly events: readonly TranscriptEvent[];
  /** The cursor of the next older page; undefined when everything kept was loaded (or nothing yet). */
  readonly nextBefore: number | undefined;
  /** The newest sequence known, from events or from a page's `lastSeq`: following resumes after it. */
  readonly newestSeq: number;
  /**
   * The subagent feeds read (`runners.cloud.transcript.feeds.v1`), each with the cursor of its next older page;
   * undefined once all of it was loaded. A feed that is not here was never read. The main agent's cursor is `nextBefore`.
   */
  readonly feeds: ReadonlyMap<string, number | undefined>;
}

export const EMPTY_TRANSCRIPT: Transcript = {
  events: [],
  nextBefore: undefined,
  newestSeq: 0,
  feeds: new Map(),
};

function merged(transcript: Transcript, incoming: readonly TranscriptEvent[]): Transcript {
  if (incoming.length === 0) return transcript;
  // The events are kept in order: the newest is the last one, never a spread of all of them.
  const last = transcript.events.at(-1)?.seq ?? 0;
  const sorted = incoming.toSorted((a, b) => a.seq - b.seq);
  const first = sorted.reduce((least, event) => Math.min(least, event.seq), Infinity);
  const highest = sorted.reduce((most, event) => Math.max(most, event.seq), 0);
  // Known sequences keep the first copy: an event never changes once written.
  const combined =
    first > last
      ? [...transcript.events, ...distinct(sorted)]
      : distinct([...transcript.events, ...sorted]).toSorted((a, b) => a.seq - b.seq);
  return {
    ...transcript,
    events: combined,
    newestSeq: Math.max(transcript.newestSeq, last, highest),
  };
}

function distinct(events: readonly TranscriptEvent[]): TranscriptEvent[] {
  const seen = new Set<number>();
  return events.filter((event) => {
    if (seen.has(event.seq)) return false;
    seen.add(event.seq);
    return true;
  });
}

/** The first page: the newest events. */
export function withLatest(transcript: Transcript, page: TranscriptPage): Transcript {
  const next = { ...merged(transcript, page.events), nextBefore: page.nextBefore };
  return { ...next, newestSeq: Math.max(next.newestSeq, page.lastSeq) };
}

export function withOlder(transcript: Transcript, page: TranscriptPage): Transcript {
  return { ...merged(transcript, page.events), nextBefore: page.nextBefore };
}

export function withLive(transcript: Transcript, event: TranscriptEvent): Transcript {
  return merged(transcript, [event]);
}

/** A page of one subagent's feed, the newest or an older one: its own cursor moves, the main agent's and `newestSeq` do not. */
export function withFeed(transcript: Transcript, feed: string, page: TranscriptPage): Transcript {
  const next = merged(transcript, page.events);
  return { ...next, feeds: new Map([...next.feeds, [feed, page.nextBefore]]) };
}
