// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import {
  approvalSteps,
  edgesOf,
  isEditableKind,
  isLinear,
  listOf,
  moveStep,
  newStep,
  nobodyApproves,
  nodeOf,
  readSteps,
  type StepDraft,
  workflowDraftOf,
  workflowIdFor,
  workflowOf,
  workflowProblem,
} from './model';

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

const line = workflow({
  start: 'a',
  version: 3,
  description: 'Old',
  inputs: [{ id: 'branch', label: 'Branch' }],
  nodes: [
    { id: 'a', kind: 'trigger', label: 'A' },
    {
      id: 'b',
      kind: 'gate',
      label: 'B',
      approvers: ['maya'],
      owner: 'owners',
      approverReason: 'Why',
      actions: [{ class: 'deploy', label: 'Deploy', patterns: ['x'], repos: ['acme'] }],
      actionsBy: 'maya',
      actionsAt: '2026-10-01T00:00:00.000Z',
      ruleIds: ['R-1'],
      position: { x: 1, y: 2 },
    },
    { id: 'c', kind: 'wait', label: 'C', wait: { title: 'Wait for QA' }, run: { command: 'kept' } },
  ],
  edges: [
    { from: 'a', to: 'b', label: 'go', on: 'success' },
    { from: 'b', to: 'c' },
  ],
});

const step = (parts: Partial<StepDraft>): StepDraft => ({ ...newStep([]), ...parts });

describe('the workflow editor’s model', () => {
  it('knows the kinds the editor changes', () => {
    expect(isEditableKind('gate')).toBe(true);
    expect(isEditableKind('wait')).toBe(false);
    expect(isEditableKind('workflow')).toBe(false);
  });

  it('says a workflow is one line only when each step goes to the next and no step has two ways out', () => {
    expect(isLinear(line)).toBe(true);
    expect(
      isLinear(workflow({ start: 'a', nodes: line.nodes, edges: [...line.edges, { from: 'c', to: null }] })),
    ).toBe(true);
    // Two ways out of one step.
    expect(isLinear(workflow({ ...line, edges: [...line.edges, { from: 'a', to: 'c' }] }))).toBe(false);
    // A step that goes back.
    expect(
      isLinear(
        workflow({
          ...line,
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
          ],
        }),
      ),
    ).toBe(false);
    // A step left without a way out before the end.
    expect(isLinear(workflow({ ...line, edges: [{ from: 'b', to: 'c' }] }))).toBe(false);
    // A path from a step the workflow does not have.
    expect(isLinear(workflow({ ...line, edges: [...line.edges, { from: 'x', to: null }] }))).toBe(false);
  });

  it('reads a workflow into a draft, and a new one as a single trigger', () => {
    const draft = workflowDraftOf(line);
    expect(draft).toMatchObject({ name: 'W', domain: 'acme', description: 'Old', linear: true });
    expect(draft.steps.map((item) => [item.id, item.approvers, item.command])).toEqual([
      ['a', '', ''],
      ['b', 'maya', ''],
      ['c', '', 'kept'],
    ]);
    expect(
      workflowDraftOf(
        workflow({
          nodes: [
            { id: 'n', kind: 'notify', label: 'N', run: { channel: '#a', message: 'm', instructions: 'i' } },
          ],
        }),
      ).steps[0],
    ).toMatchObject({
      channel: '#a',
      message: 'm',
      instructions: 'i',
      detail: '',
    });
    const fresh = workflowDraftOf(undefined);
    expect(fresh).toMatchObject({ name: '', domain: '', description: '', linear: true });
    expect(fresh.steps.map((item) => [item.key, item.id, item.kind])).toEqual([[0, 'n-1', 'trigger']]);
  });

  it('gives a new step an id and a key nobody has', () => {
    const steps = [step({ key: 4, id: 'n-2' }), step({ key: 1, id: 'n-3' })];
    expect(newStep(steps)).toMatchObject({ key: 5, id: 'n-4', kind: 'step' });
  });

  it('moves a step up or down, and leaves one at either end where it is', () => {
    const steps = [step({ key: 0 }), step({ key: 1 }), step({ key: 2 })];
    expect(moveStep(steps, 1, -1).map((item) => item.key)).toEqual([1, 0, 2]);
    expect(moveStep(steps, 1, 1).map((item) => item.key)).toEqual([0, 2, 1]);
    expect(moveStep(steps, 0, -1).map((item) => item.key)).toEqual([0, 1, 2]);
    expect(moveStep(steps, 2, 1).map((item) => item.key)).toEqual([0, 1, 2]);
  });

  it('reads a list of logins, once each', () => {
    expect(listOf(' maya, samir  maya,,')).toEqual(['maya', 'samir']);
    expect(listOf('  ')).toEqual([]);
  });

  it('says what keeps a draft from being saved, in order', () => {
    const fine = { ...workflowDraftOf(undefined), name: 'N', domain: 'acme' };
    expect(workflowProblem({ ...fine, name: ' ' })).toBe('name');
    expect(workflowProblem({ ...fine, domain: ' ' })).toBe('domain');
    expect(workflowProblem({ ...fine, steps: [] })).toBe('noSteps');
    expect(workflowProblem(fine)).toBe('label');
    expect(workflowProblem({ ...fine, steps: [step({ label: 'L' })] })).toBeUndefined();
  });

  it('knows a gate nobody may approve', () => {
    expect(nobodyApproves(step({ kind: 'gate', approvers: ' , ' }))).toBe(true);
    expect(nobodyApproves(step({ kind: 'gate', approvers: 'maya' }))).toBe(false);
    expect(nobodyApproves(step({ kind: 'step' }))).toBe(false);
  });

  it('writes a step back as a node, keeping what the editor does not show', () => {
    const [, gate, wait] = workflowDraftOf(line).steps;
    if (gate === undefined || wait === undefined) throw new Error('steps');
    expect(nodeOf({ ...gate, label: ' B2 ', detail: ' more ', approvers: 'maya, samir' })).toEqual({
      id: 'b',
      kind: 'gate',
      label: 'B2',
      detail: 'more',
      approvers: ['maya', 'samir'],
      owner: 'owners',
      approverReason: 'Why',
      actions: line.nodes[1]?.actions,
      actionsBy: 'maya',
      actionsAt: '2026-10-01T00:00:00.000Z',
      ruleIds: ['R-1'],
      position: { x: 1, y: 2 },
    });
    // A gate turned into a step loses what only a gate has, and runs its command.
    expect(nodeOf({ ...gate, kind: 'step', command: ' pnpm test ' })).toEqual({
      id: 'b',
      kind: 'step',
      label: 'B',
      run: { command: 'pnpm test' },
      ruleIds: ['R-1'],
      position: { x: 1, y: 2 },
    });
    // A wait keeps its kind's settings, the editor shows none of them.
    expect(nodeOf(wait)).toEqual({
      id: 'c',
      kind: 'wait',
      label: 'C',
      run: { command: 'kept' },
      wait: { title: 'Wait for QA' },
    });
  });

  it('sends only the fields a kind shows, and keeps the run’s other settings', () => {
    const base = {
      id: 'x',
      kind: 'step' as const,
      label: 'X',
      run: {
        on: { classes: ['deploy'] },
        timeoutSec: 30,
        where: 'ostrom' as const,
        network: false,
        agent: 'claude',
        model: 'opus',
        deliverable: { type: 'pr' },
        command: 'old',
      },
      when: { hours: '09:00-18:00' },
      suggested: {},
      workflowId: 'w2',
      arguments: { a: 'b' },
      maxVisits: 2,
    };
    const draft = step({
      id: 'x',
      label: 'X',
      kind: 'notify',
      channel: '#ops',
      message: 'hi',
      command: 'old',
      base,
    });
    expect(nodeOf(draft)).toEqual({
      id: 'x',
      kind: 'notify',
      label: 'X',
      run: {
        on: { classes: ['deploy'] },
        timeoutSec: 30,
        where: 'ostrom',
        network: false,
        agent: 'claude',
        model: 'opus',
        deliverable: { type: 'pr' },
        channel: '#ops',
        message: 'hi',
      },
      when: { hours: '09:00-18:00' },
      suggested: {},
      workflowId: 'w2',
      arguments: { a: 'b' },
      maxVisits: 2,
    });
    expect(nodeOf(step({ label: 'A', kind: 'agent', instructions: ' fix ' }))).toMatchObject({
      run: { instructions: 'fix' },
    });
    expect(nodeOf(step({ label: 'T', kind: 'trigger', command: 'ignored' }))).not.toHaveProperty('run');
    expect(nodeOf(step({ label: 'G', kind: 'gate', approvers: '' }))).not.toHaveProperty('approvers');
  });

  it('draws one line through a linear draft, keeping a path’s words while it goes to the same step', () => {
    const draft = workflowDraftOf(line);
    expect(edgesOf(draft, line)).toEqual([
      { from: 'a', to: 'b', label: 'go', on: 'success' },
      { from: 'b', to: 'c' },
      { from: 'c', to: null },
    ]);
    const swapped = { ...draft, steps: moveStep(draft.steps, 0, 1) };
    expect(edgesOf(swapped, line)).toEqual([
      { from: 'b', to: 'a' },
      { from: 'a', to: 'c' },
      { from: 'c', to: null },
    ]);
    expect(edgesOf(workflowDraftOf(undefined), undefined)).toEqual([{ from: 'n-1', to: null }]);
    const branching = { ...draft, linear: false };
    expect(edgesOf(branching, line)).toBe(line.edges);
  });

  it('makes an id from the name that no workflow has', () => {
    expect(workflowIdFor('Déploiement — prod!', [])).toBe('wf-deploiement-prod');
    expect(workflowIdFor('  ', ['wf-workflow', 'wf-workflow-2'])).toBe('wf-workflow-3');
  });

  it('writes the workflow a draft says, with its status as a person decided it', () => {
    const now = '2026-11-02T00:00:00.000Z';
    const fresh = { ...workflowDraftOf(undefined), name: ' New ', domain: ' acme/x ' };
    expect(workflowOf(fresh, undefined, 'wf-new', now)).toEqual({
      id: 'wf-new',
      name: 'New',
      domain: 'acme/x',
      nodes: [{ id: 'n-1', kind: 'trigger', label: '' }],
      edges: [{ from: 'n-1', to: null }],
      start: 'n-1',
      status: 'accepted',
      foundAt: now,
    });
    const edited = workflowOf({ ...workflowDraftOf(line), description: ' ' }, line, 'w', now);
    expect(edited).toMatchObject({
      version: 3,
      start: 'a',
      inputs: [{ id: 'branch', label: 'Branch' }],
      status: 'accepted',
    });
    expect(edited).not.toHaveProperty('description');
    expect(edited.foundAt).toBe('2026-10-01T00:00:00.000Z');
    const proposed = { ...line, status: 'proposed' as const, sources: [{ kind: 'file', ref: 'a.yml' }] };
    expect(workflowOf(workflowDraftOf(proposed), proposed, 'w', now)).toMatchObject({
      status: 'edited',
      sources: [{ kind: 'file', ref: 'a.yml' }],
      description: 'Old',
    });
    // A workflow that branches keeps where it starts.
    const branching = { ...workflowDraftOf(line), linear: false, steps: [] };
    expect(workflowOf(branching, line, 'w', now).start).toBe('a');
    expect(workflowOf({ ...fresh, steps: [] }, undefined, 'w', now)).not.toHaveProperty('start');
  });
});
