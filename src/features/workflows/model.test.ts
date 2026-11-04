// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import {
  approvalSteps,
  conditionOf,
  EDITABLE_KINDS,
  type EditedNode,
  edgesOf,
  isLinear,
  listOf,
  moveStep,
  newStep,
  nobodyApproves,
  nodeOf,
  readSteps,
  repoChoices,
  repoLabel,
  repoPattern,
  reposOf,
  reposText,
  runSource,
  type StepDraft,
  toggleRepo,
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
  it('offers every kind of step, a wait and a called workflow included', () => {
    expect(EDITABLE_KINDS).toEqual([
      'trigger',
      'step',
      'check',
      'gate',
      'notify',
      'agent',
      'wait',
      'workflow',
    ]);
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
    // a wait asks something, a workflow step runs one, a check's condition holds before it is sent
    expect(workflowProblem({ ...fine, steps: [step({ label: 'W', kind: 'wait', question: ' ' })] })).toBe(
      'question',
    );
    expect(workflowProblem({ ...fine, steps: [step({ label: 'R', kind: 'workflow' })] })).toBe('call');
    const tests = step({ id: 'tests', label: 'Tests' });
    const check = (parts: Partial<StepDraft>): StepDraft =>
      step({
        id: 'c',
        label: 'C',
        kind: 'check',
        conditionStep: 'tests',
        conditionPath: 'output.status',
        ...parts,
      });
    expect(workflowProblem({ ...fine, steps: [tests, check({ conditionValue: 'ok' })] })).toBeUndefined();
    // a check reads any step of the workflow, one after it included, never one it does not have
    expect(workflowProblem({ ...fine, steps: [check({ conditionValue: 'ok' }), tests] })).toBeUndefined();
    expect(workflowProblem({ ...fine, steps: [tests, check({ conditionStep: 'gone' })] })).toBe(
      'condition.step',
    );
    expect(workflowProblem({ ...fine, steps: [tests, check({ conditionPath: '$.status' })] })).toBe(
      'condition.path',
    );
    expect(
      workflowProblem({ ...fine, steps: [tests, check({ conditionOp: 'matches', conditionValue: '(' })] }),
    ).toBe('condition.pattern');
    // a check with no condition written sends none
    expect(
      workflowProblem({ ...fine, steps: [tests, check({ conditionStep: '', conditionPath: '' })] }),
    ).toBeUndefined();
  });

  it('refuses a condition on a check of a branching workflow whose paths out do not say true or false', () => {
    const branching = workflow({
      nodes: [
        { id: 'tests', kind: 'step', label: 'Tests' },
        { id: 'c', kind: 'check', label: 'C' },
        { id: 'ship', kind: 'step', label: 'Ship' },
      ],
      edges: [
        { from: 'tests', to: 'c' },
        { from: 'c', to: 'ship' },
        { from: 'tests', to: 'ship' },
      ],
    });
    const draft = workflowDraftOf(branching);
    const conditioned = {
      ...draft,
      steps: draft.steps.map((one) =>
        one.id === 'c'
          ? { ...one, conditionStep: 'tests', conditionPath: 'outcome', conditionValue: 'ok' }
          : one,
      ),
    };
    expect(draft.linear).toBe(false);
    expect(workflowProblem(conditioned, branching)).toBe('condition.branches');
    // its paths say where true and false go: it is sent as it is
    const said = {
      ...branching,
      edges: [
        { from: 'tests', to: 'c' },
        { from: 'c', to: 'ship', on: 'true' },
        { from: 'c', to: null, on: 'false' },
        { from: 'tests', to: 'ship' },
      ],
    };
    expect(workflowProblem(conditioned, said)).toBeUndefined();
    // without a condition, its paths are its own
    expect(workflowProblem(draft, branching)).toBeUndefined();
    // without the workflow it was read from, there is no path out to check
    expect(workflowProblem(conditioned)).toBeUndefined();
  });

  it('sends a conditioned check on when it reads true; read false, the run fails there, with its reason', () => {
    const draft = workflowDraftOf(line);
    const reads = {
      kind: 'check' as const,
      conditionStep: 'a',
      conditionPath: 'outcome',
      conditionValue: 'ok',
    };
    const checked = {
      ...draft,
      steps: draft.steps.map((one) => (one.id === 'b' ? { ...one, ...reads } : one)),
    };
    expect(edgesOf(checked, line)).toEqual([
      { from: 'a', to: 'b', label: 'go', on: 'success' },
      { from: 'b', to: 'c', on: 'true' },
    ]);
    // the last step, conditioned, ends on true, even where the workflow ended by no path
    const last = { ...draft, steps: draft.steps.map((one) => (one.id === 'c' ? { ...one, ...reads } : one)) };
    expect(edgesOf(last, line)).toEqual([
      { from: 'a', to: 'b', label: 'go', on: 'success' },
      { from: 'b', to: 'c' },
      { from: 'c', to: null, on: 'true' },
    ]);
    // a line read untouched goes back as it was read
    expect(edgesOf(draft, line)).toBe(line.edges);
    // a path that already says false keeps it: read false, that check goes on
    const onFalse = {
      ...line,
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c', on: 'false' },
      ],
    };
    const both = {
      ...workflowDraftOf(onFalse),
      steps: workflowDraftOf(onFalse).steps.map((one) => (one.id === 'a' ? one : { ...one, ...reads })),
    };
    expect(edgesOf(both, onFalse)).toEqual([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c', on: 'false' },
      { from: 'c', to: null, on: 'true' },
    ]);
  });

  it('reads a check’s condition from its fields, with a value except for exists', () => {
    const check = step({
      kind: 'check',
      conditionStep: ' tests ',
      conditionPath: ' a.b ',
      conditionValue: ' x ',
    });
    expect(conditionOf(check)).toEqual({ step: 'tests', path: 'a.b', op: 'equals', value: ' x ' });
    expect(conditionOf({ ...check, conditionOp: 'exists' })).toEqual({
      step: 'tests',
      path: 'a.b',
      op: 'exists',
    });
    expect(conditionOf({ ...check, kind: 'step' })).toBeUndefined();
    expect(conditionOf(step({ kind: 'check', conditionValue: ' ' }))).toBeUndefined();
    expect(conditionOf(step({ kind: 'check', conditionValue: '' }))).toBeUndefined();
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
    // A wait writes its question; a command it does not show goes.
    expect(nodeOf(wait)).toEqual({ id: 'c', kind: 'wait', label: 'C', wait: { title: 'Wait for QA' } });
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
      // a step that no longer runs a workflow names none
      arguments: { a: 'b' },
      maxVisits: 2,
    });
    expect(nodeOf(step({ label: 'A', kind: 'agent', instructions: ' fix ' }))).toMatchObject({
      run: { instructions: 'fix' },
    });
    expect(nodeOf(step({ label: 'T', kind: 'trigger', command: 'ignored' }))).not.toHaveProperty('run');
    expect(nodeOf(step({ label: 'G', kind: 'gate', approvers: '' }))).not.toHaveProperty('approvers');
  });

  it('writes a check’s condition, the workflow a step runs, and what a wait asks', () => {
    expect(
      nodeOf(
        step({
          label: 'C',
          kind: 'check',
          conditionStep: 'tests',
          conditionPath: 'status',
          conditionValue: 'ok',
        }),
      ),
    ).toEqual({
      id: 'n-1',
      kind: 'check',
      label: 'C',
      condition: { step: 'tests', path: 'status', op: 'equals', value: 'ok' },
    });
    expect(nodeOf(step({ label: 'R', kind: 'workflow', calls: 'wf-release' }))).toEqual({
      id: 'n-1',
      kind: 'workflow',
      label: 'R',
      workflowId: 'wf-release',
    });
    expect(nodeOf(step({ label: 'R', kind: 'workflow' }))).not.toHaveProperty('workflowId');
    // a wait read with its form keeps its fields, actions and links; its title and text are written here
    const asked = {
      id: 'q',
      kind: 'wait' as const,
      label: 'Q',
      wait: {
        title: 'Old',
        body: 'Old text',
        fields: [{ id: 'why', type: 'text', label: 'Why' }],
        actions: [{ id: 'go', label: 'Go' }],
        refs: [{ kind: 'pr', url: 'https://example.com' }],
      },
    };
    const [read] = workflowDraftOf(workflow({ nodes: [asked] })).steps;
    if (read === undefined) throw new Error('step');
    expect(read).toMatchObject({ question: 'Old', questionBody: 'Old text' });
    expect(nodeOf({ ...read, question: ' Ship it? ', questionBody: ' ' }).wait).toEqual({
      title: 'Ship it?',
      fields: asked.wait.fields,
      actions: asked.wait.actions,
      refs: asked.wait.refs,
    });
    expect(nodeOf({ ...read, questionBody: 'New text' }).wait).toMatchObject({
      title: 'Old',
      body: 'New text',
    });
    // a check read with its condition gives its fields back
    const conditioned: EditedNode = {
      id: 'k',
      kind: 'check',
      label: 'K',
      condition: { step: 'a', path: 'p', op: 'exists' },
    };
    const [checked] = workflowDraftOf(workflow({ nodes: [conditioned] })).steps;
    expect(checked).toMatchObject({
      conditionStep: 'a',
      conditionPath: 'p',
      conditionOp: 'exists',
      conditionValue: '',
    });
  });

  it('draws one line through a linear draft, keeping a path’s words and how the workflow ends', () => {
    const draft = workflowDraftOf(line);
    // The workflow ends by no path at all: so does the line.
    expect(edgesOf(draft, line)).toEqual([
      { from: 'a', to: 'b', label: 'go', on: 'success' },
      { from: 'b', to: 'c' },
    ]);
    const swapped = { ...draft, steps: moveStep(draft.steps, 0, 1) };
    expect(edgesOf(swapped, line)).toEqual([
      { from: 'b', to: 'a' },
      { from: 'a', to: 'c' },
    ]);
    // One that ends by a path to nowhere keeps it; a new one ends so.
    const ended = { ...line, edges: [...line.edges, { from: 'c', to: null }] };
    expect(edgesOf(workflowDraftOf(ended), ended)).toEqual([
      ...edgesOf(draft, line),
      { from: 'c', to: null },
    ]);
    expect(edgesOf(workflowDraftOf(undefined), undefined)).toEqual([{ from: 'n-1', to: null }]);
    const branching = { ...draft, linear: false };
    expect(edgesOf(branching, line)).toBe(line.edges);
  });

  it('keeps each step’s place in the list and the start the workflow named, or did not', () => {
    const now = '2026-11-02T00:00:00.000Z';
    const plain: Workflow = {
      id: line.id,
      name: line.name,
      domain: line.domain,
      status: line.status,
      foundAt: line.foundAt,
      nodes: [0, 2, 1].flatMap((at) => {
        const node = line.nodes[at];
        return node === undefined ? [] : [node];
      }),
      edges: line.edges,
    };
    const draft = workflowDraftOf(plain);
    const saved = workflowOf({ ...draft, steps: [...draft.steps, newStep(draft.steps)] }, plain, 'w', now);
    expect(draft.linear).toBe(true);
    expect(saved.nodes.map((node) => node.id)).toEqual(['a', 'c', 'b', 'n-4']);
    expect(saved).not.toHaveProperty('start');
    // Moved to the front, another step names the start.
    const second = draft.steps[1];
    if (second === undefined) throw new Error('two steps');
    expect(
      workflowOf({ ...draft, steps: moveStep(draft.steps, second.key, -1) }, plain, 'w', now).start,
    ).toBe(second.id);
  });

  it('makes an id from the name that no workflow has', () => {
    expect(workflowIdFor('Déploiement — prod!', [])).toBe('wf-deploiement-prod');
    expect(workflowIdFor('  ', ['wf-workflow', 'wf-workflow-2'])).toBe('wf-workflow-3');
    // Cut at 48 characters, never on a dash.
    expect(workflowIdFor(`${'a'.repeat(47)} b`, [])).toBe(`wf-${'a'.repeat(47)}`);
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
    expect(workflowOf({ ...workflowDraftOf(proposed), name: 'W2' }, proposed, 'w', now)).toMatchObject({
      status: 'edited',
      sources: [{ kind: 'file', ref: 'a.yml' }],
      description: 'Old',
    });
    // Saved unchanged, a proposed workflow is accepted as found.
    expect(workflowOf(workflowDraftOf(proposed), proposed, 'w', now).status).toBe('accepted');
    // A workflow that branches keeps where it starts.
    const branching = { ...workflowDraftOf(line), linear: false, steps: [] };
    expect(workflowOf(branching, line, 'w', now).start).toBe('a');
    expect(workflowOf({ ...fresh, steps: [] }, undefined, 'w', now)).not.toHaveProperty('start');
  });

  it('keeps the repositories a workflow is limited to, and says a change of them alone', () => {
    const now = '2026-11-03T00:00:00.000Z';
    const limited = workflow({ repos: ['acme/api', '*/web'] });
    expect(workflowDraftOf(limited).repos).toEqual(['acme/api', '*/web']);
    expect(workflowDraftOf(workflow({})).repos).toEqual([]);
    expect(workflowDraftOf(undefined).repos).toEqual([]);
    // Untouched, they go back as read, and a proposed workflow saved so is accepted as found.
    const proposed = { ...limited, status: 'proposed' as const };
    expect(workflowOf(workflowDraftOf(proposed), proposed, 'w', now)).toMatchObject({
      repos: ['acme/api', '*/web'],
      status: 'accepted',
    });
    // Changed, the change alone makes it edited.
    const fewer = workflowOf({ ...workflowDraftOf(proposed), repos: ['*/web'] }, proposed, 'w', now);
    expect(fewer).toMatchObject({ repos: ['*/web'], status: 'edited' });
    // None left: no field, every repository again; and none on a new one.
    expect(workflowOf({ ...workflowDraftOf(limited), repos: [] }, limited, 'w', now)).not.toHaveProperty(
      'repos',
    );
    const fresh = { ...workflowDraftOf(undefined), name: 'N', domain: 'd' };
    expect(workflowOf(fresh, undefined, 'n', now)).not.toHaveProperty('repos');
    expect(workflowOf({ ...fresh, repos: ['*/api'] }, undefined, 'n', now).repos).toEqual(['*/api']);
    // An empty list read from the server is the same as none.
    const empty = workflow({ repos: [] });
    expect(workflowOf(workflowDraftOf(empty), empty, 'w', now)).not.toHaveProperty('repos');
  });

  it('reads and writes the repositories by name, and keeps the ones written elsewhere', () => {
    expect(reposOf(workflow({}))).toBeUndefined();
    expect(reposOf(workflow({ repos: [] }))).toBeUndefined();
    expect(reposText(workflow({}))).toBeUndefined();
    expect(reposText(workflow({ repos: ['acme/api', '*/web', 'acme/*'] }))).toBe('acme/api, web, acme/*');
    expect(repoPattern('web')).toBe('*/web');
    expect(repoLabel('*/web')).toBe('web');
    expect(repoLabel('acme/web')).toBe('acme/web');
    expect(repoChoices(['api', 'web'], ['*/web', 'acme/old'])).toEqual(['*/api', '*/web', 'acme/old']);
    expect(repoChoices([], [])).toEqual([]);
    expect(toggleRepo(['*/api'], '*/web')).toEqual(['*/api', '*/web']);
    expect(toggleRepo(['*/api', '*/web'], '*/api')).toEqual(['*/web']);
  });
});

describe('runSource', () => {
  it('names the sources it knows, and keeps any other as the server wrote it', () => {
    expect(['manual', 'automation', 'webhook'].map(runSource)).toEqual(['manual', 'automation', 'other']);
  });
});
