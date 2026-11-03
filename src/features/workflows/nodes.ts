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

export function conditionProblem(
  condition: NodeCondition,
  earlier: readonly string[],
): ConditionProblem | undefined {
  // stub: refuses only an empty step when nothing comes before
  return condition.step === '' && earlier.length === 0 ? 'step' : undefined;
}

/** The workflows a `workflow` step may call from [self]: never itself, nor one that calls it, even through others. */
export function callChoices(workflows: readonly Workflow[], self: string | undefined): Workflow[] {
  // stub: offers every workflow
  return workflows.filter((workflow) => workflow.id !== '' || self === undefined);
}
