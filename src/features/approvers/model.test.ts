// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { approvalPoints, isSelfApprovalPolicy } from './model';

const workflow = (id: string, nodes: Workflow['nodes']): Workflow => ({
  id,
  name: `Workflow ${id}`,
  domain: 'acme',
  nodes,
  edges: [],
  status: 'accepted',
  foundAt: '2026-10-01T00:00:00.000Z',
});

const workflows = [
  workflow('a', [
    { id: 't', kind: 'trigger', label: 'Start' },
    { id: 'g1', kind: 'gate', label: 'Merge', approvers: ['maya', 'samir'], approverReason: 'Owners' },
  ]),
  workflow('b', [
    { id: 'g2', kind: 'gate', label: 'Deploy', approvers: ['samir'], owner: 'release' },
    { id: 'g3', kind: 'gate', label: 'Drop a table' },
  ]),
];

describe('approvalPoints', () => {
  it('keeps the gates of every workflow, with their approvers', () => {
    const points = approvalPoints(workflows);
    expect(points.map((point) => point.key)).toEqual(['a/g1', 'b/g2', 'b/g3']);
    expect(points[0]).toMatchObject({ workflowName: 'Workflow a', reason: 'Owners', actions: [] });
    expect(points[2]?.approvers).toEqual([]);
  });
});

describe('the self-approval policy', () => {
  it('knows the two self-approval policies', () => {
    expect([
      isSelfApprovalPolicy('never'),
      isSelfApprovalPolicy('sole-approver'),
      isSelfApprovalPolicy('x'),
    ]).toEqual([true, true, false]);
  });
});
