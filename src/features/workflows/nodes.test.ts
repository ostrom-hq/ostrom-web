// SPDX-License-Identifier: AGPL-3.0-only
import type { Workflow } from '@gen/api/types.gen';
import { callChoices, conditionProblem, type NodeCondition } from './nodes';

const workflow = (id: string, calls: readonly string[] = []): Workflow => ({
  id,
  name: id,
  domain: 'acme',
  status: 'accepted',
  foundAt: '2026-10-01T00:00:00.000Z',
  nodes: calls.map((target, at) => ({
    id: `call-${String(at)}`,
    kind: 'workflow',
    label: `Run ${target}`,
    workflowId: target,
  })),
  edges: [],
});

describe('the condition of a check', () => {
  const earlier = ['tests', 'build'];
  const condition = (parts: Partial<NodeCondition>): NodeCondition => ({
    step: 'tests',
    path: 'result.status',
    op: 'equals',
    value: 'passed',
    ...parts,
  });
  // the same condition with no value at all (an absent key, not an undefined one)
  const bare = (parts: Omit<Partial<NodeCondition>, 'value'>): NodeCondition => ({
    step: 'tests',
    path: 'result.status',
    op: 'equals',
    ...parts,
  });

  it('takes a condition on an earlier step, with a simple path and what to compare', () => {
    expect(conditionProblem(condition({}), earlier)).toBeUndefined();
    expect(conditionProblem(condition({ path: 'items[0].name', op: 'notEquals', value: '' }), earlier)).toBeUndefined();
    expect(conditionProblem(bare({ op: 'exists' }), earlier)).toBeUndefined();
    expect(conditionProblem(condition({ op: 'matches', value: '^v[0-9]+$' }), earlier)).toBeUndefined();
  });

  it('refuses a step that does not come before, by name', () => {
    expect(conditionProblem(condition({ step: '' }), earlier)).toBe('step');
    expect(conditionProblem(condition({ step: 'deploy' }), earlier)).toBe('step');
  });

  it('refuses a path that is not a simple JSON path: no expression', () => {
    for (const path of ['', 'result..status', '$.result', 'result.status == 1', 'a[b]', 'a[-1]', '.a', 'a.'])
      expect(conditionProblem(condition({ path }), earlier), path).toBe('path');
  });

  it('wants a value to compare, except for exists, which takes none', () => {
    expect(conditionProblem(bare({}), earlier)).toBe('value');
    expect(conditionProblem(bare({ op: 'matches' }), earlier)).toBe('value');
    expect(conditionProblem(condition({ op: 'exists', value: 'x' }), earlier)).toBe('value');
  });

  it('refuses a pattern that does not compile, or that is too long', () => {
    expect(conditionProblem(condition({ op: 'matches', value: '(' }), earlier)).toBe('pattern');
    expect(conditionProblem(condition({ op: 'matches', value: 'a'.repeat(201) }), earlier)).toBe('pattern');
    expect(conditionProblem(condition({ op: 'matches', value: 'a'.repeat(200) }), earlier)).toBeUndefined();
  });
});

describe('the workflow a step calls', () => {
  it('offers every other workflow of the organization', () => {
    const all = [workflow('deploy'), workflow('review'), workflow('release')];
    expect(callChoices(all, 'deploy').map((w) => w.id)).toEqual(['review', 'release']);
    expect(callChoices(all, undefined).map((w) => w.id)).toEqual(['deploy', 'review', 'release']);
  });

  it('never offers one that calls it, even through others: no cycle', () => {
    const all = [
      workflow('deploy'),
      workflow('review', ['deploy']),
      workflow('release', ['review']),
      workflow('lint', ['lint']),
      workflow('docs', ['gone']),
    ];
    // a call to a workflow no longer listed leads nowhere
    expect(callChoices(all, 'deploy').map((w) => w.id)).toEqual(['lint', 'docs']);
  });
});
