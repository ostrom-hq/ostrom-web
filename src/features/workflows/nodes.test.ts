// SPDX-License-Identifier: Apache-2.0
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
  // the nodes of the workflow: a check may read any of them, one after it included (core#127)
  const nodes = ['tests', 'build', 'deploy'];
  const condition = (parts: Partial<NodeCondition>): NodeCondition => ({
    step: 'tests',
    path: 'output.status',
    op: 'equals',
    value: 'passed',
    ...parts,
  });
  // the same condition with no value at all (an absent key, not an undefined one)
  const bare = (parts: Omit<Partial<NodeCondition>, 'value'>): NodeCondition => ({
    step: 'tests',
    path: 'output.status',
    op: 'equals',
    ...parts,
  });
  const key = 'k'.repeat(64);

  it('takes a condition on a step of the workflow, a path of its visit and what to compare', () => {
    expect(conditionProblem(condition({}), nodes)).toBeUndefined();
    expect(conditionProblem(condition({ step: 'deploy' }), nodes)).toBeUndefined();
    const paths = [
      'outcome',
      'output',
      'output.a-b.c_D9',
      'output.items[0].name',
      'output[9999]',
      `output.${key}`,
      `output${'.k'.repeat(10)}`,
      `output${'[0]'.repeat(10)}`,
    ];
    for (const path of paths) expect(conditionProblem(condition({ path }), nodes), path).toBeUndefined();
    expect(conditionProblem(condition({ op: 'notEquals', value: '' }), nodes)).toBeUndefined();
    expect(conditionProblem(bare({ op: 'exists' }), nodes)).toBeUndefined();
    expect(conditionProblem(condition({ op: 'matches', value: '^v[0-9]+$' }), nodes)).toBeUndefined();
  });

  it('refuses a step that is not a node of the workflow', () => {
    expect(conditionProblem(condition({ step: '' }), nodes)).toBe('step');
    expect(conditionProblem(condition({ step: 'gone' }), nodes)).toBe('step');
  });

  it('refuses a path out of its form: outcome, output, or up to 10 keys or indexes of the output, 200 characters in all', () => {
    const paths = [
      '',
      'result.status',
      'Output',
      'outcome.a',
      'output.',
      'output..a',
      'output.a b',
      'output[]',
      'output[-1]',
      'output[10000]',
      'output.a[x]',
      '$.output',
      `output.${key}k`,
      `output${'.k'.repeat(11)}`,
      `output${'[0]'.repeat(11)}`,
      `output.${key}.${key}.${key}`,
    ];
    for (const path of paths) expect(conditionProblem(condition({ path }), nodes), path).toBe('path');
  });

  it('wants a value of at most 200 characters, except for exists, which takes none', () => {
    expect(conditionProblem(bare({}), nodes)).toBe('value');
    expect(conditionProblem(bare({ op: 'matches' }), nodes)).toBe('value');
    expect(conditionProblem(condition({ op: 'exists', value: 'x' }), nodes)).toBe('value');
    expect(conditionProblem(condition({ value: 'a'.repeat(201) }), nodes)).toBe('value');
    expect(conditionProblem(condition({ op: 'notEquals', value: 'a'.repeat(200) }), nodes)).toBeUndefined();
  });

  it('takes a pattern in the syntax the server matches in linear time', () => {
    const patterns = [
      'a'.repeat(200),
      '',
      '.*',
      'a|',
      '()',
      '(a|b)+c?',
      '[^\\]]+',
      '[a-z_-]',
      '\\d\\w\\s\\.\\{\\}\\/\\-\\\\',
      '^v$',
    ];
    for (const value of patterns)
      expect(conditionProblem(condition({ op: 'matches', value }), nodes), value).toBeUndefined();
  });

  it('refuses a pattern out of that syntax, or too long', () => {
    const patterns = [
      'a'.repeat(201),
      '(',
      'a)',
      'a{2}',
      '(?=a)',
      '\\1',
      '\\q',
      'a\\',
      '[a',
      '[\\q]',
      '*a',
      'a|+',
    ];
    for (const value of patterns)
      expect(conditionProblem(condition({ op: 'matches', value }), nodes), value).toBe('pattern');
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
