// SPDX-License-Identifier: AGPL-3.0-only
import type { Wait, WaitAction, WaitField, WaitRef, WaitStatus } from '@gen/api/types.gen';
import { safeHref } from '@/shared/lib/safeHref';

/** The three states the list filters by (`status=`); the server's `all` is not offered. */
export const FILTERS = ['open', 'resolved', 'cancelled'] as const satisfies readonly WaitStatus[];
export type WaitFilter = (typeof FILTERS)[number];

/** Whose waits: what I asked or was asked (the server's default), or only what is asked of me (`mine=true`). */
export const SCOPES = ['involved', 'mine'] as const;
export type WaitScope = (typeof SCOPES)[number];

/** The page size the console asks for (the server's default); the badge in the navigation reads the largest page. */
export const PAGE = 50;
export const BADGE_PAGE = 100;

/** The kinds a cloud session answers itself: `POST /waits/{id}/answer` refuses them (409 `answer_through_session`). */
const THROUGH_SESSION: readonly string[] = ['permission', 'question'];

export function answeredThroughSession(wait: Wait): boolean {
  return THROUGH_SESSION.includes(wait.kind);
}

/** The text of the longest a `text` field may be when the wait does not say (the server's default). */
export const TEXT_LIMIT = 8_000;
/** What a free "other" answer of a choice may be. */
export const OTHER_LIMIT = 500;

/** The action buttons' styles the contract names; anything else reads as secondary. */
export type ActionStyle = 'primary' | 'secondary' | 'danger';

export function styleOf(action: WaitAction): ActionStyle {
  return action.style === 'primary' || action.style === 'danger' ? action.style : 'secondary';
}

/** The actions to show: those the wait asks for, else the single `done` one (the server's rule), labelled `doneLabel`. */
export function actionsOf(wait: Wait, doneLabel: string): readonly WaitAction[] {
  const actions = wait.question.actions ?? [];
  return actions.length === 0 ? [{ id: 'done', label: doneLabel, style: 'primary' }] : actions;
}

/** The value of one field while it is being filled in: the text of an input, or the picks of a choice. */
export interface Draft {
  /** `text`, `number`, `date`: what was typed; `confirm`: `true`, `false` or empty. */
  readonly text: string;
  /** `choice`: the options ticked. */
  readonly picked: readonly string[];
  /** `choice` with `allowOther`: the free answer. */
  readonly other: string;
}

export type Drafts = Readonly<Record<string, Draft>>;

const EMPTY: Draft = { text: '', picked: [], other: '' };

export const VALUE_TYPES = ['text', 'choice', 'confirm', 'number', 'date'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export function valueTypeOf(field: WaitField): ValueType | undefined {
  return VALUE_TYPES.find((type) => type === field.type);
}

function stringsOf(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** The field's first state: its `default`, read for its type, else empty. */
export function draftOf(field: WaitField): Draft {
  const value = field.default;
  switch (valueTypeOf(field)) {
    case 'text':
    case 'date':
      return typeof value === 'string' ? { ...EMPTY, text: value } : EMPTY;
    case 'number':
      return typeof value === 'number' ? { ...EMPTY, text: String(value) } : EMPTY;
    case 'confirm':
      return typeof value === 'boolean' ? { ...EMPTY, text: String(value) } : EMPTY;
    case 'choice': {
      const options = field.options ?? [];
      const given = stringsOf(value);
      const known = given.filter((item) => options.includes(item));
      const free = given.find((item) => !options.includes(item));
      const picked = field.multiple === true ? known : known.slice(0, 1);
      return field.allowOther === true &&
        free !== undefined &&
        (field.multiple === true || known.length === 0)
        ? { ...EMPTY, picked, other: free }
        : { ...EMPTY, picked };
    }
    case undefined:
      return EMPTY;
  }
}

export function draftsOf(fields: readonly WaitField[]): Drafts {
  return Object.fromEntries(fields.map((field) => [field.id, draftOf(field)]));
}

export type FieldProblem = 'required' | 'tooLong' | 'notNumber' | 'notDate' | 'otherTooLong';

export type FieldValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: string | number | boolean | readonly string[] }
  | { readonly kind: 'invalid'; readonly problem: FieldProblem };

const EMPTY_VALUE: FieldValue = { kind: 'empty' };

/** Whether `YYYY-MM-DD` names a real day (not 2026-02-30). */
export function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().startsWith(text);
}

/** What a field holds once filled in, as the server wants to receive it; `empty` when nothing was given. */
export function valueOf(field: WaitField, draft: Draft | undefined): FieldValue {
  const { text, picked, other } = draft ?? EMPTY;
  switch (valueTypeOf(field)) {
    case 'text':
      if (text.trim() === '') return EMPTY_VALUE;
      return text.length > (field.maxLength ?? TEXT_LIMIT)
        ? { kind: 'invalid', problem: 'tooLong' }
        : { kind: 'value', value: text };
    case 'number': {
      if (text.trim() === '') return EMPTY_VALUE;
      const parsed = Number(text);
      // A JSON number: `0x1F`, `0b11` and `1_000` are numbers to JavaScript but not what was meant.
      return /^\s*-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*$/.test(text) && Number.isFinite(parsed)
        ? { kind: 'value', value: parsed }
        : { kind: 'invalid', problem: 'notNumber' };
    }
    case 'date':
      if (text === '') return EMPTY_VALUE;
      return isCalendarDate(text) ? { kind: 'value', value: text } : { kind: 'invalid', problem: 'notDate' };
    case 'confirm':
      return text === '' ? EMPTY_VALUE : { kind: 'value', value: text === 'true' };
    case 'choice': {
      const free = other.trim();
      if (free.length > OTHER_LIMIT) return { kind: 'invalid', problem: 'otherTooLong' };
      const given = free === '' ? picked : [...picked, free];
      const [first] = given;
      if (first === undefined) return EMPTY_VALUE;
      return { kind: 'value', value: field.multiple === true ? given : first };
    }
    case undefined:
      return EMPTY_VALUE;
  }
}

/** Fields that take no value from the person (`info`) or that this screen cannot fill (`file`, `secret`). */
export function takesValue(field: WaitField): boolean {
  return valueTypeOf(field) !== undefined;
}

export interface Answer {
  readonly action: string;
  readonly values: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

/** Why a field blocks an answer: a value that is wrong, or one that is missing. */
export type Problems = Readonly<Record<string, FieldProblem>>;

/** The ids of the fields an action needs besides the required ones. */
function neededBy(action: WaitAction): readonly string[] {
  return action.requires ?? [];
}

/**
 * Checks an answer before it is sent, as the server will: every value well-formed, every `required` field filled,
 * and the fields the chosen action `requires`. The server still decides; this saves the round trip.
 */
export function answerFor(
  fields: readonly WaitField[],
  drafts: Drafts,
  action: WaitAction,
): { readonly answer: Answer } | { readonly problems: Problems } {
  const values: Record<string, string | number | boolean | readonly string[]> = {};
  const problems: Record<string, FieldProblem> = {};
  for (const field of fields.filter(takesValue)) {
    const read = valueOf(field, drafts[field.id]);
    if (read.kind === 'value') values[field.id] = read.value;
    else if (read.kind === 'invalid') problems[field.id] = read.problem;
    else if (field.required === true || neededBy(action).includes(field.id)) problems[field.id] = 'required';
  }
  return Object.keys(problems).length > 0 ? { problems } : { answer: { action: action.id, values } };
}

/** The problems without the one of field `id`: the person fixed it. */
export function without(problems: Problems, id: string): Problems {
  return Object.fromEntries(Object.entries(problems).filter(([key]) => key !== id));
}

/** What a ref links to inside the console, or outside; a ref the console cannot open has no target. */
export type RefTarget =
  | { readonly kind: 'artifact'; readonly id: string }
  | { readonly kind: 'session'; readonly id: string }
  | { readonly kind: 'external'; readonly href: string };

export function targetOf(ref: WaitRef): RefTarget | undefined {
  if ((ref.kind === 'artifact' || ref.kind === 'session') && ref.id !== undefined) {
    return { kind: ref.kind, id: ref.id };
  }
  const href = safeHref(ref.url);
  return href === undefined ? undefined : { kind: 'external', href };
}

/** The values of a resolved wait's answer, one line per field, as the form showed them. */
export function shownValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(shownValue).join(', ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

const MEMBER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether the server wrote a member id: a person the console cannot name should not read as a number. */
export function isMemberId(who: string): boolean {
  return MEMBER_ID.test(who);
}

/** Whether `who` (a member id, login or username as the server wrote it) names the viewer. */
export function isViewer(
  who: string | undefined,
  viewer: { readonly memberId: string | undefined; readonly login: string | undefined },
): boolean {
  if (who === undefined) return false;
  return who === viewer.memberId || who.toLowerCase() === viewer.login?.toLowerCase();
}

/** The badge's count: a page that has more says so ("100+"). */
export function countLabel(count: number, more: boolean): string {
  return more ? `${String(count)}+` : String(count);
}
