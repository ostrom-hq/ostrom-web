// SPDX-License-Identifier: AGPL-3.0-only
import { handleGetApproversGraph } from '@gen/api/msw.gen';
import type { ApproverGate, ApproverLine, Workflow } from '@gen/api/types.gen';
import { type HttpHandler, HttpResponse } from 'msw';

export interface ApproversGraphState {
  workflows: Workflow[];
}

/** The action classes the demo's catalogue knows; those no gate covers run without asking anyone. */
const KNOWN_ACTIONS = ['deploy', 'drop-table', 'merge-main', 'migrate', 'push-main'];

/**
 * `GET /gates/approvers` as the server builds it from the gates catalogue: a gate counts once it covers an action
 * class, approvers by name, the gates naming nobody, then the classes no gate covers.
 */
export function createApproversGraphHandlers(state: () => ApproversGraphState): HttpHandler[] {
  return [
    handleGetApproversGraph(() => {
      const gates = state()
        .workflows.flatMap((workflow) =>
          workflow.nodes.flatMap((node) => {
            const actions = [...new Set((node.actions ?? []).map((action) => action.class))].sort();
            if (node.kind !== 'gate' || actions.length === 0) return [];
            const gate: ApproverGate = {
              workflowId: workflow.id,
              workflowName: workflow.name,
              nodeId: node.id,
              label: node.label,
              enforce: workflow.status === 'accepted',
              actions,
            };
            return [{ gate, approvers: [...new Set(node.approvers ?? [])] }];
          }),
        )
        .sort((a, b) => {
          const byWorkflow = a.gate.workflowId.localeCompare(b.gate.workflowId, 'en');
          return byWorkflow !== 0 ? byWorkflow : a.gate.nodeId.localeCompare(b.gate.nodeId, 'en');
        });
      const byApprover = new Map<string, ApproverGate[]>();
      for (const { gate, approvers } of gates)
        for (const approver of approvers)
          byApprover.set(approver, [...(byApprover.get(approver) ?? []), gate]);
      const approvers: ApproverLine[] = [...byApprover.entries()]
        .map(([approver, list]) => ({ approver, gates: list }))
        .sort((a, b) => a.approver.localeCompare(b.approver, 'en'));
      const covered = new Set(gates.flatMap(({ gate }) => gate.actions));
      return HttpResponse.json({
        approvers,
        unanswered: gates.filter(({ approvers: names }) => names.length === 0).map(({ gate }) => gate),
        ungated: KNOWN_ACTIONS.filter((action) => !covered.has(action)),
      });
    }),
  ];
}
