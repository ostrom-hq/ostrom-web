// SPDX-License-Identifier: Apache-2.0
import { ApiFailure } from '@/shared/api/ApiFailure';
import { type AgentQuestion, eventOf, type PermissionRequest, type TranscriptEvent } from './events';
import { transcriptItems } from './items';
import {
  acceptedOutcome,
  answerOf,
  answersOf,
  cardOf,
  draftOf,
  edited,
  failedOutcome,
  NEW_DRAFT,
  nextQuestion,
  openPermissionRequests,
  otherText,
  type PermissionDraft,
  previousQuestion,
  reconciledDrafts,
  sameAnswer,
  selectOption,
  selectOther,
  validText,
} from './permissions';

const AT = '2026-11-15T10:00:00.000Z';

function event(seq: number, type: string, data: unknown): TranscriptEvent {
  return eventOf({ seq, type, at: AT, epoch: 1, data });
}

function request(seq: number, id: string, data: Record<string, unknown> = {}): PermissionRequest {
  const read = event(seq, 'permission.request', { requestId: id, toolName: 'Bash', input: {}, ...data });
  if (read.kind !== 'permission') throw new Error('not a request');
  return read;
}

function ids(events: readonly TranscriptEvent[]): (string | undefined)[] {
  return openPermissionRequests(events).map((open) => open.requestId);
}

const single: AgentQuestion = {
  index: 0,
  text: 'Red or blue?',
  header: undefined,
  options: [
    { label: 'Red', description: undefined },
    { label: 'Blue', description: undefined },
  ],
  multiSelect: false,
};
const multi: AgentQuestion = {
  index: 3,
  text: 'Which sizes?',
  header: undefined,
  options: [
    { label: 'S', description: undefined },
    { label: 'M', description: undefined },
    { label: 'L', description: undefined },
  ],
  multiSelect: true,
};

function choice(
  options: number[],
  other = false,
  text = '',
): { options: number[]; other: boolean; otherText: string } {
  return { options, other, otherText: text };
}

describe('the permission requests (TeamCode PermissionUseCasesTest)', () => {
  it('keeps a request open until its answer is consumed, it expires, its turn ends or the agent restarts', () => {
    const events = [
      event(1, 'turn', { phase: 'started' }),
      request(2, 'a'),
      request(3, 'b'),
      request(4, 'c'),
      // A rejected answer leaves its request open; a consumed one closes it.
      event(5, 'input', { inputId: 'i1', status: 'rejected', reason: 'invalid_answer', requestId: 'a' }),
      event(6, 'input', { inputId: 'i2', status: 'consumed', requestId: 'b' }),
      event(7, 'permission.expired', { requestId: 'c' }),
    ];
    expect(ids(events)).toEqual(['a']);
    expect(ids([...events, event(8, 'turn', { phase: 'interrupted' })])).toEqual([]);
    expect(ids([...events, event(8, 'status', { exitCode: 1 })])).toEqual([]);
    // A turn that only started (or a phase this version does not know) leaves it open; requests come oldest first.
    expect(ids([...events, event(8, 'turn', { phase: 'paused' }), request(9, 'd')])).toEqual(['a', 'd']);
    // A request asked again moves to its newest place.
    expect(ids([...events, request(9, 'd'), request(10, 'a')])).toEqual(['d', 'a']);
    // A request without an id cannot be answered, nor closed by events without one.
    expect(
      ids([
        event(1, 'permission.request', { toolName: 'Bash' }),
        event(2, 'input', { status: 'consumed' }),
        event(3, 'permission.expired', {}),
      ]),
    ).toEqual([]);
  });

  it('answers with the API indexes or a text', () => {
    expect(answerOf(single, undefined)).toBeUndefined();
    expect(answerOf(single, choice([]))).toBeUndefined();
    expect(answerOf(single, choice([1]))).toEqual({ question: 0, options: [1] });
    expect(answerOf(single, choice([], true, ' Green '))).toEqual({ question: 0, text: 'Green' });
    // "Other" picked but left empty answers nothing.
    expect(answerOf(single, choice([], true, '  '))).toBeUndefined();
    expect(answerOf(single, choice([], true, 'a'.repeat(4_001)))).toBeUndefined();
    // An index the question does not have is left out.
    expect(answerOf(single, choice([5]))).toBeUndefined();
    // Indexes are the request's own, sorted, whatever order they were picked in.
    expect(answerOf(multi, choice([2, 0]))).toEqual({ question: 3, options: [0, 2] });
    expect(answerOf(multi, choice([], true, 'XL'))).toEqual({ question: 3, text: 'XL' });
    // Options and a text together: the API takes one, so the labels and the text go as one text, as Claude Code reads it.
    expect(answerOf(multi, choice([2, 0], true, 'XL'))).toEqual({ question: 3, text: 'S, L, XL' });
    expect(answerOf(multi, choice([0], true, 'x'.repeat(3_999)))).toBeUndefined();
    expect(answerOf(multi, choice([]))).toBeUndefined();
    expect(answersOf([single, multi], new Map([[0, choice([0])]]))).toBeUndefined();
    expect(
      answersOf(
        [single, multi],
        new Map([
          [0, choice([0])],
          [3, choice([1])],
        ]),
      ),
    ).toEqual([
      { question: 0, options: [0] },
      { question: 3, options: [1] },
    ]);
  });

  it('takes a text the server would: not blank, at most 4,000 characters, no control character', () => {
    expect(validText('line\none\ttab\r')).toBe(true);
    expect(validText('ring \u0007')).toBe(false);
    expect(validText('del \u007f')).toBe(false);
    expect(validText('')).toBe(false);
  });

  it('tells what to do next from the server’s answer', () => {
    expect(
      acceptedOutcome({ id: 'in-1', kind: 'permission', status: 'queued', authorId: 'm1', createdAt: AT }),
    ).toEqual({
      kind: 'accepted',
      inputId: 'in-1',
    });
    // A replayed acknowledgement of an answer that was then refused is final like a refusal.
    expect(
      acceptedOutcome({
        id: 'in-1',
        kind: 'permission',
        status: 'rejected',
        authorId: 'm1',
        reason: 'late',
        createdAt: AT,
      }),
    ).toEqual({ kind: 'refused', code: 'late', reason: undefined });
    expect(
      acceptedOutcome({ id: 'in-1', kind: 'permission', status: 'cancelled', authorId: 'm1', createdAt: AT })
        .kind,
    ).toBe('refused');
    const failure = (status: number | undefined, code?: string): ApiFailure =>
      new ApiFailure('server', `failed ${String(status)}`, status, undefined, code);
    for (const status of [undefined, 503, 408, 429])
      expect(failedOutcome(failure(status)).kind).toBe('retry');
    expect(failedOutcome(new Error('offline'))).toEqual({ kind: 'retry', reason: 'offline' });
    expect(failedOutcome('lost')).toEqual({ kind: 'retry', reason: 'lost' });
    expect(failedOutcome(failure(409, 'permission_request_expired'))).toEqual({
      kind: 'closed',
      code: 'permission_request_expired',
    });
    expect(failedOutcome(failure(400, 'permission_input_unseen'))).toEqual({
      kind: 'invalid',
      code: 'permission_input_unseen',
    });
    expect(failedOutcome(failure(403, 'permission_owner_only'))).toEqual({
      kind: 'refused',
      code: 'permission_owner_only',
      reason: 'failed 403',
    });
  });
});

describe('the permission card (TeamCode SessionViewModel)', () => {
  const question = request(1, 'q', {
    question: true,
    input: {
      questions: [
        { question: 'Red or blue?', options: [{ label: 'Red' }, { label: 'Blue' }] },
        { question: 'Which sizes?', multiSelect: true, options: [{ label: 'S' }, { label: 'M' }] },
      ],
    },
  });

  it('walks the questions one at a time, each answered before the next', () => {
    let card = cardOf(question, NEW_DRAFT, 0);
    expect(card).toMatchObject({
      answerable: true,
      step: 0,
      last: false,
      currentAnswered: false,
      editable: true,
    });
    // Not answered yet: Next stays.
    expect(nextQuestion(card)).toBe(card.draft);
    card = cardOf(question, selectOption(card, 0, 1), 0);
    expect(card.currentAnswered).toBe(true);
    card = cardOf(question, selectOption(card, 0, 0), 0);
    expect(card.draft.choices.get(0)?.options).toEqual([0]);
    card = cardOf(question, nextQuestion(card), 0);
    expect(card).toMatchObject({ step: 1, last: true, currentAnswered: false });
    // The last question has no next.
    card = cardOf(question, selectOption(card, 1, 0), 0);
    card = cardOf(question, selectOption(card, 1, 1), 0);
    expect(card.draft.choices.get(1)?.options).toEqual([0, 1]);
    card = cardOf(question, selectOption(card, 1, 0), 0);
    expect(card.draft.choices.get(1)?.options).toEqual([1]);
    expect(nextQuestion(card)).toBe(card.draft);
    card = cardOf(question, previousQuestion(card), 0);
    expect(card.step).toBe(0);
    expect(previousQuestion(card).step).toBe(0);
    // A step out of range reads as the nearest question.
    expect(cardOf(question, { ...NEW_DRAFT, step: 9 }, 0).step).toBe(1);
  });

  it('makes "Other" exclusive in a single choice and an addition in a multi-select one', () => {
    let card = cardOf(question, selectOption(cardOf(question, NEW_DRAFT, 0), 0, 1), 0);
    card = cardOf(question, selectOther(card, 0), 0);
    expect(card.draft.choices.get(0)).toEqual(choice([], true, ''));
    card = cardOf(question, otherText(card, 0, 'Green'), 0);
    expect(card.draft.choices.get(0)).toEqual(choice([], true, 'Green'));
    card = cardOf(question, selectOption(card, 1, 0), 0);
    card = cardOf(question, selectOther(card, 1), 0);
    expect(card.draft.choices.get(1)).toEqual(choice([0], true, ''));
    card = cardOf(question, selectOther(card, 1), 0);
    expect(card.draft.choices.get(1)?.other).toBe(false);
    card = cardOf(question, otherText(card, 1, 'XL'), 0);
    expect(card.draft.choices.get(1)).toEqual(choice([0], true, 'XL'));
    // Typing in a single choice's "Other" picks it over the option.
    card = cardOf(question, selectOption(card, 0, 0), 0);
    card = cardOf(question, otherText(card, 0, 'Teal'), 0);
    expect(card.draft.choices.get(0)).toEqual(choice([], true, 'Teal'));
    // Typing in "Other" before picking anything picks it.
    expect(otherText(cardOf(question, NEW_DRAFT, 0), 1, 'XS').choices.get(1)).toEqual(choice([], true, 'XS'));
    // A question the request does not have changes nothing.
    expect(selectOption(card, 7, 0)).toBe(card.draft);
    expect(selectOther(card, 7)).toBe(card.draft);
    expect(otherText(card, 7, 'x')).toBe(card.draft);
  });

  it('can only decline a request whose input was left out, or a question without questions', () => {
    expect(
      cardOf(request(1, 'big', { input: undefined, inputTruncated: true }), NEW_DRAFT, 0).answerable,
    ).toBe(false);
    expect(
      cardOf(request(1, 'empty', { question: true, input: { questions: [] } }), NEW_DRAFT, 2),
    ).toMatchObject({
      answerable: false,
      current: undefined,
      currentAnswered: false,
      waiting: 2,
    });
    expect(cardOf(request(1, 'x', { requestId: undefined }), NEW_DRAFT, 0).requestId).toBe('');
    const sent: PermissionDraft = { ...NEW_DRAFT, state: 'sent' };
    expect(draftOf(new Map([['x', sent]]), request(1, 'x'))).toBe(sent);
    expect(draftOf(new Map([['x', sent]]), request(1, 'x', { requestId: undefined }))).toBe(NEW_DRAFT);
  });

  it('drops the key of an answer once it is changed, and keeps it for the same one', () => {
    const sent: PermissionDraft = {
      ...NEW_DRAFT,
      state: 'failed',
      sending: { requestId: 'q', allow: true, answers: [] },
      key: 'k1',
      reason: 'offline',
    };
    expect(edited(sent, { ...sent, step: 1 })).toEqual({ ...sent, step: 1 });
    expect(edited(sent, { ...sent, choices: new Map([[0, choice([1])]]) })).toMatchObject({
      state: 'editing',
      sending: undefined,
      key: undefined,
      reason: undefined,
    });
    expect(sameAnswer(sent.sending, { requestId: 'q', allow: true, answers: [] })).toBe(true);
    expect(sameAnswer(sent.sending, { requestId: 'q', allow: false, answers: [] })).toBe(false);
    expect(sameAnswer(undefined, { requestId: 'q', allow: false, answers: [] })).toBe(false);
  });

  it('drops the drafts of closed requests and reopens an answer the agent did not take', () => {
    const open = [request(1, 'a'), request(2, 'b')];
    const drafts = new Map<string, PermissionDraft>([
      ['a', { ...NEW_DRAFT, state: 'sent', inputId: 'in-a' }],
      ['b', { ...NEW_DRAFT, state: 'sent', inputId: 'in-b' }],
      ['gone', NEW_DRAFT],
    ]);
    const events = [
      event(3, 'input', { inputId: 'in-a', status: 'rejected', reason: 'delivery_failed' }),
      event(4, 'input', { inputId: 'in-b', status: 'queued' }),
      event(5, 'input', { status: 'rejected' }),
    ];
    const kept = reconciledDrafts(drafts, open, events);
    expect([...kept.keys()]).toEqual(['a', 'b']);
    expect(kept.get('a')).toMatchObject({
      state: 'editing',
      inputId: undefined,
      rejected: 'delivery_failed',
    });
    expect(kept.get('b')).toBe(drafts.get('b'));
    expect(
      reconciledDrafts(new Map([['a', { ...NEW_DRAFT, state: 'sent', inputId: 'in-a' }]]), open, [
        event(3, 'input', { inputId: 'in-a', status: 'cancelled' }),
      ]).get('a')?.rejected,
    ).toBe('cancelled');
    // Nothing changed: the same drafts.
    const same = new Map([['a', NEW_DRAFT]]);
    expect(reconciledDrafts(same, open, events)).toBe(same);
    const none = new Map<string, PermissionDraft>();
    expect(reconciledDrafts(none, open, events)).toBe(none);
  });

  it('says a consumed permission answer in the transcript, and skips other consumed inputs', () => {
    const items = transcriptItems([
      event(1, 'input', { inputId: 'i1', status: 'consumed' }),
      event(2, 'input', { inputId: 'i2', status: 'consumed', requestId: 'r1' }),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['system']);
  });
});
