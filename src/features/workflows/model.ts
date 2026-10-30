// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow, WorkflowEdge, WorkflowNode, WorkflowStatus } from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

/** A proposed workflow waits for an owner: amber until someone accepts it. */
export const STATUS_TONES: Readonly<Record<WorkflowStatus, BadgeTone>> = {
  proposed: 'warning',
  accepted: 'success',
  edited: 'success',
};

export interface Step {
  readonly node: WorkflowNode;
  /** Where the flow goes after this step; `to: undefined` ends the workflow. */
  readonly next: readonly { readonly to: WorkflowNode | undefined; readonly edge: WorkflowEdge }[];
}

/**
 * The steps in the order a person reads them: from the start, following the edges breadth first (so a branch
 * shows right after the step it leaves), then any step no edge reaches, in the order the workflow lists them.
 */
export function readSteps(workflow: Workflow): Step[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const first = workflow.start ?? workflow.nodes[0]?.id;
  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue = first === undefined ? [] : [first];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const node = byId.get(id);
    if (node === undefined || seen.has(id)) continue;
    seen.add(id);
    order.push(node);
    for (const edge of workflow.edges) if (edge.from === id && edge.to !== null) queue.push(edge.to);
  }
  for (const node of workflow.nodes) if (!seen.has(node.id)) order.push(node);
  return order.map((node) => ({
    node,
    next: workflow.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => ({ to: edge.to === null ? undefined : byId.get(edge.to), edge })),
  }));
}

/** How many steps ask a person, which the list shows next to each workflow. */
export function approvalSteps(workflow: Workflow): number {
  return workflow.nodes.filter((node) => node.kind === 'gate').length;
}
