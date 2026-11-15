// SPDX-License-Identifier: Apache-2.0
import type { CloudInputDto } from '@gen/api/types.gen';
import { ApiFailure } from '@/shared/api/ApiFailure';
import type { TranscriptEvent } from './events';
import { draftOf, errorOf, failed, MAX_MESSAGE_CHARS, received, reconciled, validMessage } from './pending';

const AT = '2026-11-15T10:00:00.000Z';

function input(status: string, extra: Partial<CloudInputDto> = {}): CloudInputDto {
  return { id: 'in-1', kind: 'message', status, authorId: 'm', createdAt: AT, ...extra };
}

describe('a message sent from the screen (TeamCode SendMessageUseCase)', () => {
  it('checks the server’s rules before sending', () => {
    expect(validMessage('hello\nthere\tand\r')).toBe(true);
    expect(validMessage('   ')).toBe(false);
    expect(validMessage('a'.repeat(MAX_MESSAGE_CHARS))).toBe(true);
    expect(validMessage('a'.repeat(MAX_MESSAGE_CHARS + 1))).toBe(false);
    expect(validMessage('bell\u0007')).toBe(false);
    expect(validMessage('del\u007f')).toBe(false);
    expect(validMessage('c1\u0085')).toBe(false);
    expect(validMessage('é ✓ 😀')).toBe(true);
  });

  it('may carry files and no text (TeamCode aMessageWithFilesMayHaveNoText)', () => {
    expect(validMessage('', true)).toBe(true);
    expect(validMessage('  ', true)).toBe(true);
    expect(validMessage('bell\u0007', true)).toBe(false);
    const file = { id: 'f1', name: 'a.png', size: 10, contentType: 'image/png' };
    expect(draftOf('', 'k2', [file]).files).toEqual([file]);
  });

  it('is sent, then received: queued, or refused with its reason, and says when it woke the session', () => {
    const draft = draftOf('hi', 'k1');
    expect(draft).toEqual({
      clientMessageId: 'k1',
      text: 'hi',
      state: 'sending',
      inputId: undefined,
      woke: false,
      reason: undefined,
      files: [],
    });
    expect(received(draft, input('queued', { woke: true }))).toMatchObject({
      state: 'sent',
      inputId: 'in-1',
      woke: true,
    });
    expect(received(draft, input('rejected', { reason: 'delivery_failed' }))).toMatchObject({
      state: 'refused',
      reason: 'delivery_failed',
    });
    expect(received(draft, input('cancelled'))).toMatchObject({ state: 'refused', woke: false });
  });

  it('fails again later on a server failure, a timeout, a rate limit or the network, and is refused otherwise', () => {
    const draft = draftOf('hi', 'k1');
    const failure = (status: number | undefined, code?: string): ApiFailure =>
      new ApiFailure('server', 'HTTP', status, undefined, code);
    expect(failed(draft, failure(503))).toMatchObject({ state: 'failed', reason: 'HTTP' });
    expect(failed(draft, failure(408))).toMatchObject({ state: 'failed' });
    expect(failed(draft, failure(429))).toMatchObject({ state: 'failed' });
    expect(failed(draft, failure(undefined))).toMatchObject({ state: 'failed' });
    expect(failed(draft, new TypeError('offline'))).toMatchObject({ state: 'failed', reason: undefined });
    expect(failed(draft, failure(409, 'session_not_running'))).toMatchObject({
      state: 'refused',
      reason: 'session_not_running',
    });
  });

  it('leaves once the transcript shows it, and is refused when an input event says so', () => {
    const events: TranscriptEvent[] = [
      { kind: 'user', seq: 1, at: AT, text: 'a', inputId: 'in-a', authorId: undefined, files: [] },
      { kind: 'user', seq: 2, at: AT, text: 'x', inputId: undefined, authorId: undefined, files: [] },
      {
        kind: 'input',
        seq: 3,
        at: AT,
        inputId: 'in-b',
        status: 'consumed',
        reason: undefined,
        requestId: undefined,
      },
      {
        kind: 'input',
        seq: 4,
        at: AT,
        inputId: 'in-c',
        status: 'rejected',
        reason: 'too_late',
        requestId: undefined,
      },
      {
        kind: 'input',
        seq: 5,
        at: AT,
        inputId: 'in-d',
        status: 'cancelled',
        reason: undefined,
        requestId: undefined,
      },
      {
        kind: 'input',
        seq: 6,
        at: AT,
        inputId: 'in-e',
        status: 'delivered',
        reason: undefined,
        requestId: undefined,
      },
      {
        kind: 'input',
        seq: 7,
        at: AT,
        inputId: undefined,
        status: 'consumed',
        reason: undefined,
        requestId: undefined,
      },
    ];
    const sent = (inputId: string | undefined): ReturnType<typeof draftOf> => ({
      ...draftOf(inputId ?? 'none', `k-${inputId ?? 'none'}`),
      state: 'sent',
      inputId,
    });
    const pending = ['in-a', 'in-b', 'in-c', 'in-d', 'in-e', undefined].map(sent);
    expect(
      reconciled(pending, events).map((message) => [message.inputId, message.state, message.reason]),
    ).toEqual([
      ['in-c', 'refused', 'too_late'],
      ['in-d', 'refused', 'cancelled'],
      ['in-e', 'sent', undefined],
      [undefined, 'sent', undefined],
    ]);
    const none: readonly ReturnType<typeof draftOf>[] = [];
    expect(reconciled(none, events)).toBe(none);
  });

  it('words whatever was thrown as an error', () => {
    const error = new Error('boom');
    expect(errorOf(error)).toBe(error);
    expect(errorOf('plain').message).toBe('plain');
  });
});
