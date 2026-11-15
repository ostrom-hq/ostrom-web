// SPDX-License-Identifier: Apache-2.0
import type { CloudInputDto, CloudQuestionAnswerDto } from '@gen/api/types.gen';
import { isApiFailure } from '@/shared/api/ApiFailure';
import { type AgentQuestion, finished, type PermissionRequest, type TranscriptEvent } from './events';

/** What the member picked for one question: options by index, and "Other" with its free text. */
export interface QuestionChoice {
  readonly options: readonly number[];
  readonly other: boolean;
  readonly otherText: string;
}

export const NO_CHOICE: QuestionChoice = { options: [], other: false, otherText: '' };

/** What `POST …/permissions` receives: allow (with `answers` for a question) or deny. */
export interface PermissionAnswer {
  readonly requestId: string;
  readonly allow: boolean;
  readonly answers: readonly CloudQuestionAnswerDto[];
}

/** How the server took an answer (TeamCode's `AnswerOutcome`). Only `retry` is worth sending again, under the same key. */
export type AnswerOutcome =
  /** Accepted (`202`): it waits for the agent; the request closes when the transcript records it consumed. */
  | { readonly kind: 'accepted'; readonly inputId: string }
  /** A network failure, a timeout, a 5xx or a 429: the answer may or may not have arrived. */
  | { readonly kind: 'retry'; readonly reason: string }
  /** `409`: answered by someone else, expired or ended (a session that takes no answer now refuses it instead). */
  | { readonly kind: 'closed'; readonly code: string | undefined }
  /** `400`: the server read the answer as invalid (an index, an unseen input); the draft stays to be corrected. */
  | { readonly kind: 'invalid'; readonly code: string | undefined }
  /** `403` and other refusals: this member may not answer it, or the server cannot. */
  | { readonly kind: 'refused'; readonly code: string | undefined; readonly reason: string | undefined };

/**
 * The server's answer rules (`POST …/permissions`), checked before sending so an incomplete answer never costs a request
 * (TeamCode's `PermissionRules`). The API takes options or a text per question, not both. "Other" is exclusive in a
 * single-choice question. In a multi-select one it may go with options: the answer is then sent as a text, the chosen
 * labels in option order followed by the other text, joined with `, `, exactly what Claude Code would receive had the
 * runner joined the labels itself.
 */
export const MAX_ANSWER_CHARS = 4_000;

const LINE_BREAKS: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0d]);

export function validText(text: string): boolean {
  if (text.trim() === '' || text.length > MAX_ANSWER_CHARS) return false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code < 0x20 || (code >= 0x7f && code <= 0x9f)) && !LINE_BREAKS.has(code)) return false;
  }
  return true;
}

/** The answer `choice` gives to `question`; undefined while it does not answer it (nothing chosen, "Other" left empty). */
export function answerOf(
  question: AgentQuestion,
  choice: QuestionChoice | undefined,
): CloudQuestionAnswerDto | undefined {
  if (choice === undefined) return undefined;
  const other = choice.otherText.trim();
  if (choice.other && !validText(other)) return undefined;
  // The question's own options, in its order: an index it does not have is left out.
  const picked = question.options.filter((_, index) => choice.options.includes(index));
  const options = question.options.flatMap((_, index) => (choice.options.includes(index) ? [index] : []));
  if (!question.multiSelect) {
    if (choice.other) return { question: question.index, text: other };
    const [single] = options;
    return options.length === 1 && single !== undefined
      ? { question: question.index, options: [single] }
      : undefined;
  }
  if (choice.other && options.length === 0) return { question: question.index, text: other };
  if (choice.other) {
    const joined = [...picked.map((option) => option.label), other].join(', ');
    return validText(joined) ? { question: question.index, text: joined } : undefined;
  }
  return options.length === 0 ? undefined : { question: question.index, options };
}

/** The answers to every question, or undefined while one of them is unanswered. */
export function answersOf(
  questions: readonly AgentQuestion[],
  choices: ReadonlyMap<number, QuestionChoice>,
): CloudQuestionAnswerDto[] | undefined {
  const answers: CloudQuestionAnswerDto[] = [];
  for (const question of questions) {
    const answer = answerOf(question, choices.get(question.index));
    if (answer === undefined) return undefined;
    answers.push(answer);
  }
  return answers;
}

/**
 * The permission requests still waiting, oldest first, from a transcript ordered by sequence: a request stays open until
 * an `input` event records its answer consumed, a `permission.expired` names it, its turn ends (a `turn` event that
 * finished), or the agent process that asked is gone (a `status` event: it exited, or a new one started).
 */
export function openPermissionRequests(events: readonly TranscriptEvent[]): PermissionRequest[] {
  const open = new Map<string, PermissionRequest>();
  for (const event of events) {
    if (event.kind === 'permission' && event.requestId !== undefined) {
      open.delete(event.requestId);
      open.set(event.requestId, event);
    }
    if (event.kind === 'input' && event.status === 'consumed' && event.requestId !== undefined)
      open.delete(event.requestId);
    if (event.kind === 'permissionExpired' && event.requestId !== undefined) open.delete(event.requestId);
    if ((event.kind === 'turn' && finished(event.phase)) || event.kind === 'status') open.clear();
  }
  return [...open.values()];
}

/**
 * How the server took an answer (TeamCode's `AnswerPermissionUseCase`): a replayed acknowledgement of an answer that was
 * then refused is final like a refusal.
 */
export function acceptedOutcome(input: CloudInputDto): AnswerOutcome {
  return input.status === 'rejected' || input.status === 'cancelled'
    ? { kind: 'refused', code: input.reason ?? undefined, reason: undefined }
    : { kind: 'accepted', inputId: input.id };
}

export function failedOutcome(error: unknown): AnswerOutcome {
  if (!isApiFailure(error) || error.status === undefined)
    return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
  const { status, code, message } = error;
  if (status >= 500 || status === 408 || status === 429) return { kind: 'retry', reason: message };
  // The session takes no answer now (pausing, resuming): the request stays, and can be answered once it runs again.
  if (status === 409 && code !== 'nothing_to_answer') return { kind: 'closed', code };
  if (status === 400) return { kind: 'invalid', code };
  return { kind: 'refused', code, reason: message };
}

/** Where an answer to a permission request stands. */
export type AnswerState = 'editing' | 'sending' | 'failed' | 'sent';

/**
 * The member's answer to one open request: the question shown (`step`), what was picked for each question (by its
 * index), and the answer on its way. `sending` and `key` go together: a retry sends exactly that answer under that key,
 * and any edit drops both, so a changed answer never reuses a key.
 */
export interface PermissionDraft {
  readonly step: number;
  readonly choices: ReadonlyMap<number, QuestionChoice>;
  readonly state: AnswerState;
  readonly sending: PermissionAnswer | undefined;
  readonly key: string | undefined;
  readonly inputId: string | undefined;
  readonly reason: string | undefined;
  /** The agent did not take the last accepted answer (an `input` event rejected it), with its reason: answer again. */
  readonly rejected: string | undefined;
}

export const NEW_DRAFT: PermissionDraft = {
  step: 0,
  choices: new Map(),
  state: 'editing',
  sending: undefined,
  key: undefined,
  inputId: undefined,
  reason: undefined,
  rejected: undefined,
};

/** The draft of `request` among `drafts`, a new one when none. */
export function draftOf(
  drafts: ReadonlyMap<string, PermissionDraft>,
  request: PermissionRequest,
): PermissionDraft {
  return drafts.get(request.requestId ?? '') ?? NEW_DRAFT;
}

/** The request shown, oldest open first, with its draft; `waiting` counts the other open ones. */
export interface PermissionCard {
  readonly request: PermissionRequest;
  readonly requestId: string;
  readonly draft: PermissionDraft;
  readonly waiting: number;
  /** A question whose input was left out (or unreadable) can only be declined, like a tool use whose input was. */
  readonly answerable: boolean;
  readonly step: number;
  readonly current: AgentQuestion | undefined;
  readonly last: boolean;
  readonly currentAnswered: boolean;
  readonly editable: boolean;
}

export function cardOf(request: PermissionRequest, draft: PermissionDraft, waiting: number): PermissionCard {
  const count = request.questions.length;
  const step = Math.min(Math.max(draft.step, 0), Math.max(count - 1, 0));
  const current = request.questions[step];
  return {
    request,
    requestId: request.requestId ?? '',
    draft,
    waiting,
    answerable: !request.inputLeftOut && (!request.question || count > 0),
    step,
    current,
    last: step >= count - 1,
    currentAnswered:
      current !== undefined && answerOf(current, draft.choices.get(current.index)) !== undefined,
    editable: draft.state === 'editing' || draft.state === 'failed',
  };
}

function withChoice(draft: PermissionDraft, question: number, choice: QuestionChoice): PermissionDraft {
  return { ...draft, choices: new Map([...draft.choices, [question, choice]]) };
}

/** Picks an option: the only one of a single-choice question (leaving "Other"), or one more of a multi-select one. */
export function selectOption(card: PermissionCard, question: number, option: number): PermissionDraft {
  const asked = card.request.questions.find((item) => item.index === question);
  if (asked === undefined) return card.draft;
  const choice = card.draft.choices.get(question) ?? NO_CHOICE;
  const next = asked.multiSelect
    ? {
        ...choice,
        options: choice.options.includes(option)
          ? choice.options.filter((picked) => picked !== option)
          : [...choice.options, option],
      }
    : { ...choice, options: [option], other: false };
  return withChoice(card.draft, question, next);
}

/** Picks "Other": exclusive in a single-choice question, toggled beside the options in a multi-select one. */
export function selectOther(card: PermissionCard, question: number): PermissionDraft {
  const asked = card.request.questions.find((item) => item.index === question);
  if (asked === undefined) return card.draft;
  const choice = card.draft.choices.get(question) ?? NO_CHOICE;
  const next = asked.multiSelect
    ? { ...choice, other: !choice.other }
    : { ...choice, options: [], other: true };
  return withChoice(card.draft, question, next);
}

/** Typing in "Other" picks it. */
export function otherText(card: PermissionCard, question: number, text: string): PermissionDraft {
  const asked = card.request.questions.find((item) => item.index === question);
  if (asked === undefined) return card.draft;
  const choice = card.draft.choices.get(question) ?? NO_CHOICE;
  const next = asked.multiSelect
    ? { ...choice, other: true, otherText: text }
    : { ...choice, options: [], other: true, otherText: text };
  return withChoice(card.draft, question, next);
}

/** Shows the next question once the current one is answered. */
export function nextQuestion(card: PermissionCard): PermissionDraft {
  return !card.currentAnswered || card.last ? card.draft : { ...card.draft, step: card.step + 1 };
}

/** Back to the previous question, its answer kept. */
export function previousQuestion(card: PermissionCard): PermissionDraft {
  return { ...card.draft, step: Math.max(card.step - 1, 0) };
}

/** Any change of the choices after a failure is a new answer: it gets a new key when sent. */
export function edited(before: PermissionDraft, after: PermissionDraft): PermissionDraft {
  return after.choices === before.choices ? after : reopened(after);
}

/** The same answer, field by field: a retry of it keeps its key. */
export function sameAnswer(a: PermissionAnswer | undefined, b: PermissionAnswer): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** Back to editing after a refusal: the next send is a new answer. */
export function reopened(draft: PermissionDraft): PermissionDraft {
  return {
    ...draft,
    state: 'editing',
    sending: undefined,
    key: undefined,
    reason: undefined,
    rejected: undefined,
  };
}

/**
 * Drafts of requests that closed are dropped; an accepted answer that an `input` event rejected or cancelled (the agent
 * could not take it: the request stays open) goes back to editing, with the reason in `rejected`.
 */
export function reconciledDrafts(
  drafts: ReadonlyMap<string, PermissionDraft>,
  open: readonly PermissionRequest[],
  events: readonly TranscriptEvent[],
): ReadonlyMap<string, PermissionDraft> {
  if (drafts.size === 0) return drafts;
  const ids = new Set(open.map((request) => request.requestId));
  /** Why each refused input was refused: its reason, or its status. */
  const refused = new Map<string, string>();
  for (const event of events)
    if (event.kind === 'input' && event.inputId !== undefined)
      if (event.status === 'rejected' || event.status === 'cancelled')
        refused.set(event.inputId, event.reason ?? event.status);
  let changed = false;
  const kept = new Map<string, PermissionDraft>();
  for (const [id, draft] of drafts) {
    if (!ids.has(id)) {
      changed = true;
      continue;
    }
    const refusal = draft.inputId === undefined ? undefined : refused.get(draft.inputId);
    if (draft.state !== 'sent' || refusal === undefined) {
      kept.set(id, draft);
      continue;
    }
    changed = true;
    kept.set(id, {
      ...reopened(draft),
      inputId: undefined,
      rejected: refusal,
    });
  }
  return changed ? kept : drafts;
}
