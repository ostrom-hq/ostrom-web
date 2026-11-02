// SPDX-License-Identifier: AGPL-3.0-only
import type { ApproverGate, ApproverLine, GateAction, NodeWhen, Workflow } from '@gen/api/types.gen';

/** One place where an agent stops for a person: a gate of a workflow, and who may say yes there. */
export interface ApprovalPoint {
  readonly key: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly label: string;
  readonly approvers: readonly string[];
  readonly reason: string | undefined;
  readonly owner: string | undefined;
  readonly actions: readonly GateAction[];
  readonly when: NodeWhen | undefined;
}

export function approvalPoints(workflows: readonly Workflow[]): ApprovalPoint[] {
  return workflows.flatMap((workflow) =>
    workflow.nodes
      .filter((node) => node.kind === 'gate')
      .map((node) => ({
        key: `${workflow.id}/${node.id}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        label: node.label,
        approvers: node.approvers ?? [],
        reason: node.approverReason,
        owner: node.owner,
        actions: node.actions ?? [],
        when: node.when,
      })),
  );
}

/** The gates that stop an agent for good: enforced, and naming nobody. A proposed gate stops nothing yet. */
export function blocking(unanswered: readonly ApproverGate[]): ApproverGate[] {
  return unanswered.filter((gate) => gate.enforce);
}

/** The server's approvers, the busiest first, then by name. */
export function busiestFirst(lines: readonly ApproverLine[]): ApproverLine[] {
  return [...lines].sort((a, b) => {
    const byCount = b.gates.length - a.gates.length;
    return byCount !== 0 ? byCount : a.approver.localeCompare(b.approver, 'en');
  });
}

export const SELF_APPROVAL_POLICIES = ['sole-approver', 'never'] as const;
export type SelfApprovalPolicy = (typeof SELF_APPROVAL_POLICIES)[number];

export function isSelfApprovalPolicy(value: string): value is SelfApprovalPolicy {
  return SELF_APPROVAL_POLICIES.some((policy) => policy === value);
}
