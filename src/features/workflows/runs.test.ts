// SPDX-License-Identifier: Apache-2.0
import type { NodeVisit, Workflow, WorkflowRun } from '@gen/api/types.gen';
import { describe, expect, it } from 'vitest';
import {
  deliverableOf,
  deliveryOf,
  deliveryVisit,
  failureWords,
  finished,
  inputsOf,
  needsRepository,
  openVisit,
  repositoryOk,
  schemaProblem,
  startProblem,
} from './runs';

const visit = (over: Partial<NodeVisit>): NodeVisit => ({
  seq: 1,
  nodeId: 'a',
  kind: 'agent',
  status: 'running',
  startedAt: '2026-10-30T07:00:00.000Z',
  ...over,
});
const run = (over: Partial<WorkflowRun>): WorkflowRun => ({
  id: 'r',
  workflowId: 'w',
  workflowName: 'W',
  workflowVersion: 1,
  status: 'running',
  startedBy: 'maya',
  source: 'manual',
  startedAt: '2026-10-30T07:00:00.000Z',
  ...over,
});
const workflow = (nodes: Workflow['nodes']): Workflow => ({
  id: 'w',
  name: 'W',
  domain: 'd',
  status: 'accepted',
  foundAt: '2026-10-30T07:00:00.000Z',
  nodes,
  edges: [],
});

describe('failureWords', () => {
  it('names a known code, a node-bound code, and nothing for the rest', () => {
    expect(failureWords(undefined)).toBeUndefined();
    expect(failureWords('expired')).toEqual({ key: 'workflows.runs.failureCode.expired' });
    expect(failureWords('max_visits:n-fix')).toEqual({
      key: 'workflows.runs.failureCode.max_visits',
      node: 'n-fix',
    });
    expect(failureWords('max_visits:')).toBeUndefined();
    expect(failureWords('something_new')).toBeUndefined();
  });
});

describe('visits', () => {
  it('knows a finished run', () => {
    expect(finished(run({ status: 'succeeded' }))).toBe(true);
    expect(finished(run({ status: 'failed' }))).toBe(true);
    expect(finished(run({ status: 'cancelled' }))).toBe(true);
    expect(finished(run({ status: 'waiting' }))).toBe(false);
  });

  it('reads the latest open visit', () => {
    expect(openVisit(run({}))).toBeUndefined();
    const open = visit({ seq: 2 });
    expect(openVisit(run({ visits: [visit({ endedAt: 'x' }), open] }))).toBe(open);
  });

  it('waits for a delivery only on an open agent visit of a run under way', () => {
    const agent = visit({});
    expect(deliveryVisit(run({ visits: [agent] }))).toBe(agent);
    expect(deliveryVisit(run({ status: 'failed', visits: [agent] }))).toBeUndefined();
    expect(deliveryVisit(run({ visits: [visit({ kind: 'wait' })] }))).toBeUndefined();
    expect(deliveryVisit(run({}))).toBeUndefined();
  });

  it('reads the deliverable of the visit node in the workflow', () => {
    const deliverable = { type: 'url' };
    const flow = workflow([{ id: 'a', kind: 'agent', label: 'A', run: { deliverable } }]);
    expect(deliverableOf(flow, visit({}))).toBe(deliverable);
    expect(deliverableOf(flow, visit({ nodeId: 'zz' }))).toBeUndefined();
    expect(deliverableOf(undefined, visit({}))).toBeUndefined();
  });
});

describe('deliveryOf', () => {
  it('refuses an empty text whatever the type', () => {
    expect(deliveryOf({ type: 'text' }, '  ')).toEqual({ ok: false, problem: 'empty' });
  });

  it('takes an artifact id alone', () => {
    expect(deliveryOf({ type: 'artifact' }, ' art_1 ')).toEqual({ ok: true, output: 'art_1' });
    expect(deliveryOf({ type: 'artifact' }, 'two words')).toEqual({ ok: false, problem: 'artifact' });
  });

  it('takes an https url on the expected host or a subdomain', () => {
    const url = { type: 'url', domain: 'GitHub.com' };
    expect(deliveryOf(url, 'nope')).toEqual({ ok: false, problem: 'url' });
    expect(deliveryOf(url, 'http://github.com/a')).toEqual({ ok: false, problem: 'urlSecure' });
    expect(deliveryOf(url, 'https://gitlab.com/a')).toEqual({
      ok: false,
      problem: 'urlDomain',
      detail: 'GitHub.com',
    });
    expect(deliveryOf(url, 'https://github.com/a')).toEqual({ ok: true, output: 'https://github.com/a' });
    expect(deliveryOf(url, 'https://gist.github.com/a')).toEqual({
      ok: true,
      output: 'https://gist.github.com/a',
    });
    expect(deliveryOf({ type: 'url' }, 'https://x.io')).toEqual({ ok: true, output: 'https://x.io' });
  });

  it('parses a json and checks it against the schema', () => {
    const json = { type: 'json', schema: { type: 'object', required: ['a'] } };
    expect(deliveryOf(json, '{')).toEqual({ ok: false, problem: 'json' });
    expect(deliveryOf(json, '{"b":1}')).toEqual({
      ok: false,
      problem: 'schema.required',
      detail: '$.a',
    });
    expect(deliveryOf(json, '{"a":1}')).toEqual({ ok: true, output: { a: 1 } });
  });

  it('hands a text, or a type the console does not know, in as written', () => {
    expect(deliveryOf({ type: 'text' }, ' hi ')).toEqual({ ok: true, output: ' hi ' });
    expect(deliveryOf({ type: 'novel' }, 'x')).toEqual({ ok: true, output: 'x' });
    expect(deliveryOf(undefined, 'x')).toEqual({ ok: true, output: 'x' });
  });
});

describe('schemaProblem', () => {
  it('accepts anything against no schema', () => {
    expect(schemaProblem(undefined, 1)).toBeUndefined();
    expect(schemaProblem({}, 1)).toBeUndefined();
  });

  it('checks types, integers being numbers', () => {
    expect(schemaProblem({ type: 'string' }, 1)).toEqual({ problem: 'schema.type', detail: '$: string' });
    expect(schemaProblem({ type: 'number' }, 2)).toBeUndefined();
    expect(schemaProblem({ type: 'integer' }, 2.5)).toEqual({ problem: 'schema.type', detail: '$: integer' });
    expect(schemaProblem({ type: 'null' }, null)).toBeUndefined();
    expect(schemaProblem({ type: 'array' }, [])).toBeUndefined();
    expect(schemaProblem({ type: 'object' }, [])).toEqual({ problem: 'schema.type', detail: '$: object' });
  });

  it('checks an enum of strings', () => {
    expect(schemaProblem({ enum: ['a', 'b'] }, 'c')).toEqual({ problem: 'schema.enum', detail: '$: a, b' });
    expect(schemaProblem({ enum: ['a'] }, 'a')).toBeUndefined();
    expect(schemaProblem({ enum: ['a'] }, 3)).toBeUndefined();
  });

  it('walks properties, required names and items', () => {
    const schema = {
      type: 'object',
      required: ['list', 3],
      properties: { list: { type: 'array', items: { type: 'string' } }, other: { type: 'string' } },
    };
    expect(schemaProblem({ ...schema, required: ['list'] }, { list: ['a', 2] })).toEqual({
      problem: 'schema.type',
      detail: '$.list[1]: string',
    });
    expect(schemaProblem({ ...schema, required: ['list'] }, { list: ['a'] })).toBeUndefined();
    expect(schemaProblem({ type: 'object' }, { a: 1 })).toBeUndefined();
    // a name that is not a string asks for nothing
    expect(schemaProblem(schema, { list: [] })).toBeUndefined();
    expect(schemaProblem(schema, {})).toEqual({ problem: 'schema.required', detail: '$.list' });
  });
});

describe('start form', () => {
  const inputs = [
    { id: 'tag', label: 'Tag', required: true, maxLength: 5 },
    { id: 'who', label: 'Who', default: 'all' },
    { id: 'free', label: 'Free' },
  ];

  it('gives the inputs written, their defaults, and leaves an empty one out', () => {
    expect(inputsOf(inputs, { tag: 'v1' })).toEqual({ tag: 'v1', who: 'all' });
    expect(inputsOf(inputs, { tag: 'v1', who: '' })).toEqual({ tag: 'v1' });
  });

  it('finds the first problem', () => {
    expect(startProblem(inputs, {})).toEqual({ input: 'tag', label: 'Tag', kind: 'required' });
    expect(startProblem(inputs, { tag: '  ' })).toEqual({ input: 'tag', label: 'Tag', kind: 'required' });
    expect(startProblem(inputs, { tag: 'toolong' })).toEqual({ input: 'tag', label: 'Tag', kind: 'tooLong' });
    expect(startProblem(inputs, { tag: 'ok' })).toBeUndefined();
  });

  it('reads a repository as owner/name, or nothing', () => {
    expect(repositoryOk('')).toBe(true);
    expect(repositoryOk('acme/api')).toBe(true);
    expect(repositoryOk('acme')).toBe(false);
  });

  it('needs a repository when an agent step names none', () => {
    expect(needsRepository(workflow([{ id: 'a', kind: 'agent', label: 'A' }]))).toBe(true);
    expect(needsRepository(workflow([{ id: 'a', kind: 'agent', label: 'A', run: { repository: '' } }]))).toBe(
      true,
    );
    expect(
      needsRepository(workflow([{ id: 'a', kind: 'agent', label: 'A', run: { repository: 'a/b' } }])),
    ).toBe(false);
    expect(needsRepository(workflow([{ id: 'a', kind: 'step', label: 'A' }]))).toBe(false);
  });
});
