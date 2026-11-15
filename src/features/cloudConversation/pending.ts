// SPDX-License-Identifier: Apache-2.0
import type { CloudInputDto } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import type { TranscriptEvent } from './events';
import type { UploadedFile } from './files';

/**
 * A message sent from this screen that the transcript does not show yet, or that failed (TeamCode's companion
 * `PendingMessage`). `clientMessageId` is its idempotency key: a retry sends it again under the same one, and the server
 * answers with the first input, never queuing it twice.
 */
export interface PendingMessage {
  readonly clientMessageId: string;
  readonly text: string;
  readonly state: PendingState;
  readonly inputId: string | undefined;
  /** Accepting it resumed a paused session. */
  readonly woke: boolean;
  /** Why it failed or was refused: the server's stable key, or its sentence. */
  readonly reason: string | undefined;
  /** The files it carries (`runners.cloud.files.v1`), already uploaded; sent again as they are on a retry. */
  readonly files: readonly UploadedFile[];
}

export type PendingState = 'sending' | 'sent' | 'failed' | 'refused';

/** The server's message rules (`POST …/messages`), checked before sending so a refusal never costs a request. */
export const MAX_MESSAGE_CHARS = 32_000;

const LINE_BREAKS: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0d]);

/** A control character other than a tab, a line feed or a carriage return. */
function hasControl(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code < 0x20 || (code >= 0x7f && code <= 0x9f)) && !LINE_BREAKS.has(code)) return true;
  }
  return false;
}

/** A message with files may have no text; without, it needs some. */
export function validMessage(text: string, withFiles = false): boolean {
  return (withFiles || text.trim() !== '') && text.length <= MAX_MESSAGE_CHARS && !hasControl(text);
}

/** A new message, on its way, with the files it carries. */
export function draftOf(
  text: string,
  clientMessageId: string,
  files: readonly UploadedFile[] = [],
): PendingMessage {
  return {
    clientMessageId,
    text,
    state: 'sending',
    inputId: undefined,
    woke: false,
    reason: undefined,
    files,
  };
}

/** The server took it: queued, or already refused (`rejected`, `cancelled`) with its reason. */
export function received(message: PendingMessage, input: CloudInputDto): PendingMessage {
  return {
    ...message,
    state: input.status === 'rejected' || input.status === 'cancelled' ? 'refused' : 'sent',
    inputId: input.id,
    woke: input.woke === true,
    reason: input.reason ?? undefined,
  };
}

/**
 * The call failed. A server failure, a timeout, a rate limit or the network may pass: `failed`, offered again. A
 * refusal (an invalid message, an ended session) would be refused again: `refused`.
 */
export function failed(message: PendingMessage, error: unknown): PendingMessage {
  const status = isApiFailure(error) ? error.status : undefined;
  const transient = status === undefined || status >= 500 || status === 408 || status === 429;
  const reason = isApiFailure(error) ? (error.code ?? error.message) : undefined;
  return { ...message, state: transient ? 'failed' : 'refused', reason };
}

/**
 * The messages still shown as pending, given the transcript: one whose `message.user` event arrived is dropped (the
 * transcript shows it), as is one whose input was consumed (a message too large for an event is recorded without its
 * input id); one an `input` event rejected or cancelled is marked refused with the event's reason.
 */
export function reconciled(
  pending: readonly PendingMessage[],
  events: readonly TranscriptEvent[],
): readonly PendingMessage[] {
  if (pending.length === 0) return pending;
  const recorded = new Set<string>();
  const refused = new Map<string, Extract<TranscriptEvent, { kind: 'input' }>>();
  for (const event of events) {
    if (event.kind === 'user' && event.inputId !== undefined) recorded.add(event.inputId);
    if (event.kind === 'input' && event.inputId !== undefined) {
      if (event.status === 'consumed') recorded.add(event.inputId);
      if (event.status === 'rejected' || event.status === 'cancelled') refused.set(event.inputId, event);
    }
  }
  return pending.flatMap((message) => {
    const id = message.inputId;
    if (id === undefined) return [message];
    if (recorded.has(id)) return [];
    const refusal = refused.get(id);
    if (refusal === undefined) return [message];
    return [{ ...message, state: 'refused' as const, reason: refusal.reason ?? refusal.status }];
  });
}

/** What a screen can say of a failure, whatever was thrown. */
export function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
