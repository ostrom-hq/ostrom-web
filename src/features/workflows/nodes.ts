// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';

/**
 * The condition of a `check` step (decision of 03/11, 00:3x): a closed type, never an expression. [step] is an earlier
 * step whose output is read, [path] a simple JSON path into it, [op] how it is compared, [value] what to (none for
 * `exists`). The server checks the same at the workflow's creation (400); the console refuses it before sending.
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

/**
 * A simple JSON path: names joined by dots, each maybe followed by indexes (`result.items[0].name`). No `$`, no
 * filter, no expression: anything else is refused here as the server refuses it.
 */
const PATH = /^[A-Za-z_][\w-]*(?:\[\d+\])*(?:\.[A-Za-z_][\w-]*(?:\[\d+\])*)*$/;

/** The longest pattern `matches` takes: the server evaluates it bounded in size, without exponential backtracking. */
export const PATTERN_MAX = 200;

function compiles(pattern: string): boolean {
  try {
    // a pattern always has a source (`(?:)` for an empty one): what counts is that it compiled
    return new RegExp(pattern).source.length > 0;
  } catch {
    return false;
  }
}

export function conditionProblem(
  condition: NodeCondition,
  earlier: readonly string[],
): ConditionProblem | undefined {
  if (!earlier.includes(condition.step)) return 'step';
  if (!PATH.test(condition.path)) return 'path';
  const { op, value } = condition;
  if (op === 'exists') return value === undefined ? undefined : 'value';
  if (value === undefined) return 'value';
  if (op === 'matches' && (value.length > PATTERN_MAX || !compiles(value))) return 'pattern';
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
