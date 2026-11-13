// SPDX-License-Identifier: Apache-2.0
import type { ApproverGate, Workflow } from '@gen/api/types.gen';
import { approvalPoints, blocking, busiestFirst, isSelfApprovalPolicy, readGraph } from './model';

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
    expect(points[0]).toMatchObject({
      workflowName: 'Workflow a',
      reason: 'Owners',
      actions: [],
      enforced: true,
    });
    expect(points[2]?.approvers).toEqual([]);
  });
});

const gate = (label: string, enforce: boolean): ApproverGate => ({
  workflowId: 'w',
  workflowName: 'W',
  nodeId: label,
  label,
  enforce,
  actions: ['deploy'],
});

describe('the server graph, read for people', () => {
  it('blocks only on an enforced gate naming nobody', () => {
    expect(blocking([gate('Deploy', true), gate('Drop', false)]).map((item) => item.label)).toEqual([
      'Deploy',
    ]);
  });

  it('puts the busiest approver first, then by name', () => {
    const lines = [
      { approver: 'zoe', gates: [gate('A', true)] },
      { approver: 'amy', gates: [gate('B', true)] },
      { approver: 'max', gates: [gate('A', true), gate('B', true)] },
    ];
    expect(busiestFirst(lines).map((line) => line.approver)).toEqual(['max', 'amy', 'zoe']);
  });
});

describe('readGraph', () => {
  it('reads who answers each gate as the server resolves it, and which gates block', () => {
    const deploy = gate('Deploy', true);
    const reading = readGraph({
      approvers: [
        { approver: 'amy', gates: [deploy] },
        { approver: 'max', gates: [deploy] },
      ],
      unanswered: [gate('Drop', true), gate('Seed', false)],
      ungated: [],
    });
    expect(reading.answeredBy.get('w/Deploy')).toEqual(['amy', 'max']);
    expect(reading.answeredBy.get('w/Drop')).toEqual([]);
    expect([...reading.blocked]).toEqual(['w/Drop']);
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
