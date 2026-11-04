// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';

/**
 * The condition of a `check` step (core#127): a closed type, never an expression. [step] is a node of the workflow
 * whose last visit is read, [path] what is read of it, [op] how it is compared, [value] with what (none for `exists`).
 * The server checks the same when the workflow is saved (400 `invalid_request`); the console refuses it before sending.
 */
export const CONDITION_OPS = ['equals', 'notEquals', 'exists', 'matches'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface NodeCondition {
  readonly step: string;
  readonly path: string;
  readonly op: ConditionOp;
  readonly value?: string;
}

/** What keeps a condition from being sent, in the order the editor says it. */
export type ConditionProblem = 'step' | 'path' | 'value' | 'pattern';

/** The longest path, value or pattern the server takes. */
export const CONDITION_TEXT_MAX = 200;

/** The longest pattern `matches` takes: the server matches it in linear time, without backtracking. */
export const PATTERN_MAX = CONDITION_TEXT_MAX;

/**
 * What a condition reads of a visit, as the server's `NodeConditions` writes it: `outcome`, `output`, or `output`
 * followed by 1 to 10 segments, each `.<key>` (1 to 64 letters, digits, `_` or `-`) or `[<index>]` (at most 4 digits).
 */
const PATH = /^(?:outcome|output(?:\.[A-Za-z0-9_-]{1,64}|\[[0-9]{1,4}\]){0,10})$/;

// The pattern syntax of the server's `LinearPattern`, checked the way its parser reads it.
const REPEATS = '*+?';
const REFUSED = '*+?{}]';
const ESCAPED = '\\.^$|?*+()[]{}-/';
const CLASSES = 'dws';

/** Whether a pattern is in the server's syntax: no counted repetition, no backreference, no lookaround. */
export function patternOk(pattern: string): boolean {
  let at = 0;
  const peek = (c: string): boolean => at < pattern.length && pattern[at] === c;
  const escape = (): boolean => {
    if (at >= pattern.length) return false;
    const c = pattern.charAt(at++);
    return CLASSES.includes(c) || ESCAPED.includes(c);
  };
  const member = (): boolean => {
    const c = pattern.charAt(at++);
    if (c === '\\') return escape();
    if (peek('-') && at + 1 < pattern.length && pattern[at + 1] !== ']') {
      const to = pattern.charAt(at + 1);
      at += 2;
      return c <= to;
    }
    return true;
  };
  const bracket = (): boolean => {
    if (peek('^')) at++;
    let members = 0;
    while (!peek(']')) {
      if (at >= pattern.length || !member()) return false;
      members++;
    }
    at++;
    return members > 0;
  };
  // alternation, then sequence, then repetition, then atom, as the server's recursive descent
  const atom = (): boolean => {
    const c = pattern.charAt(at++);
    if (REFUSED.includes(c)) return false;
    if (c === '(') {
      if (peek('?') || !alternation() || !peek(')')) return false;
      at++;
      return true;
    }
    if (c === '[') return bracket();
    if (c === '\\') return escape();
    return true;
  };
  const sequence = (): boolean => {
    while (at < pattern.length && pattern[at] !== '|' && pattern[at] !== ')') {
      if (!atom()) return false;
      while (at < pattern.length && REPEATS.includes(pattern.charAt(at))) at++;
    }
    return true;
  };
  const alternation = (): boolean => {
    if (!sequence()) return false;
    while (peek('|')) {
      at++;
      if (!sequence()) return false;
    }
    return true;
  };
  return alternation() && at === pattern.length;
}

/** What keeps a condition from being sent; [nodes] are the ids of the workflow's nodes, any of which it may read. */
export function conditionProblem(
  condition: NodeCondition,
  nodes: readonly string[],
): ConditionProblem | undefined {
  if (!nodes.includes(condition.step)) return 'step';
  if (condition.path.length > CONDITION_TEXT_MAX || !PATH.test(condition.path)) return 'path';
  const { op, value } = condition;
  if (op === 'exists') return value === undefined ? undefined : 'value';
  if (value === undefined) return 'value';
  if (op === 'matches') return value.length <= PATTERN_MAX && patternOk(value) ? undefined : 'pattern';
  if (value.length > CONDITION_TEXT_MAX) return 'value';
  return undefined;
}

/** The workflows a `workflow` step may call from [self]: never itself, nor one that calls it, even through others. */
export function callChoices(workflows: readonly Workflow[], self: string | undefined): Workflow[] {
  if (self === undefined) return [...workflows];
  const calls = new Map(
    workflows.map((workflow) => [
      workflow.id,
      workflow.nodes.flatMap((node) =>
        node.kind === 'workflow' && node.workflowId !== undefined ? [node.workflowId] : [],
      ),
    ]),
  );
  // Whether [from] reaches [self] by the calls of its steps: each workflow is followed once.
  const reaches = (from: string, seen: Set<string>): boolean => {
    if (from === self) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return (calls.get(from) ?? []).some((next) => reaches(next, seen));
  };
  return workflows.filter((workflow) => !reaches(workflow.id, new Set()));
}
