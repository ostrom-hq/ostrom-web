// SPDX-License-Identifier: AGPL-3.0-only
import type { GateAction, NodeWhen, Workflow } from '@gen/api/types.gen';

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

export interface PersonApprovals {
  readonly login: string;
  readonly points: readonly ApprovalPoint[];
}

/** The same map read the other way: for each person, what they can say yes to; most first. */
export function byPerson(points: readonly ApprovalPoint[]): PersonApprovals[] {
  const people = new Map<string, ApprovalPoint[]>();
  for (const point of points) {
    for (const login of point.approvers) people.set(login, [...(people.get(login) ?? []), point]);
  }
  return [...people.entries()]
    .map(([login, list]) => ({ login, points: list }))
    .sort((a, b) => b.points.length - a.points.length || a.login.localeCompare(b.login, 'en'));
}

/** A gate nobody may approve stops the agent for good: it is shown first, as a problem. */
export function unanswerable(points: readonly ApprovalPoint[]): ApprovalPoint[] {
  return points.filter((point) => point.approvers.length === 0);
}

export const SELF_APPROVAL_POLICIES = ['sole-approver', 'never'] as const;
export type SelfApprovalPolicy = (typeof SELF_APPROVAL_POLICIES)[number];

export function isSelfApprovalPolicy(value: string): value is SelfApprovalPolicy {
  return SELF_APPROVAL_POLICIES.some((policy) => policy === value);
}
