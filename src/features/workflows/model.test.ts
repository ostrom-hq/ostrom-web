// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { approvalSteps, readSteps } from './model';

const workflow = (parts: Partial<Workflow>): Workflow => ({
  id: 'w',
  name: 'W',
  domain: 'acme',
  status: 'accepted',
  foundAt: '2026-10-01T00:00:00.000Z',
  nodes: [],
  edges: [],
  ...parts,
});

describe('readSteps', () => {
  it('follows the edges from the start, breadth first, then adds the steps nothing reaches', () => {
    const steps = readSteps(
      workflow({
        start: 'a',
        nodes: [
          { id: 'z', kind: 'notify', label: 'Orphan' },
          { id: 'c', kind: 'gate', label: 'C' },
          { id: 'b', kind: 'check', label: 'B' },
          { id: 'a', kind: 'trigger', label: 'A' },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c', on: 'success' },
          { from: 'b', to: 'a', on: 'failure' },
          { from: 'c', to: null },
          { from: 'c', to: 'gone' },
        ],
      }),
    );
    expect(steps.map((step) => step.node.id)).toEqual(['a', 'b', 'c', 'z']);
    expect(steps[1]?.next.map((next) => next.to?.id)).toEqual(['c', 'a']);
    expect(steps[2]?.next.map((next) => next.to)).toEqual([undefined, undefined]);
  });

  it('starts from the first step without a start, and reads an empty workflow', () => {
    const steps = readSteps(workflow({ nodes: [{ id: 'x', kind: 'step', label: 'X' }] }));
    expect(steps.map((step) => step.node.id)).toEqual(['x']);
    expect(readSteps(workflow({}))).toEqual([]);
    expect(readSteps(workflow({ start: 'missing', nodes: [] }))).toEqual([]);
  });
});

describe('approvalSteps', () => {
  it('counts the steps that ask a person', () => {
    expect(
      approvalSteps(
        workflow({
          nodes: [
            { id: 'a', kind: 'gate', label: 'A' },
            { id: 'b', kind: 'step', label: 'B' },
          ],
        }),
      ),
    ).toBe(1);
  });
});
