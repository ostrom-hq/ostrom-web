// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { approvalPoints, byPerson, isSelfApprovalPolicy, unanswerable } from './model';

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

describe('byPerson', () => {
  it('reads the map per person, the busiest first, then by login', () => {
    const people = byPerson(approvalPoints(workflows));
    expect(people.map((person) => [person.login, person.points.map((point) => point.label)])).toEqual([
      ['samir', ['Merge', 'Deploy']],
      ['maya', ['Merge']],
    ]);
  });

  it('orders people with as many gates by login', () => {
    const people = byPerson(
      approvalPoints([workflow('c', [{ id: 'g', kind: 'gate', label: 'X', approvers: ['zed', 'amy'] }])]),
    );
    expect(people.map((person) => person.login)).toEqual(['amy', 'zed']);
  });
});

describe('unanswerable and the policy', () => {
  it('finds the gates nobody may approve', () => {
    expect(unanswerable(approvalPoints(workflows)).map((point) => point.label)).toEqual(['Drop a table']);
  });

  it('knows the two self-approval policies', () => {
    expect([
      isSelfApprovalPolicy('never'),
      isSelfApprovalPolicy('sole-approver'),
      isSelfApprovalPolicy('x'),
    ]).toEqual([true, true, false]);
  });
});
