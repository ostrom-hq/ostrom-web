// SPDX-License-Identifier: Apache-2.0
import type {
  Deliverable,
  NodeVisit,
  RunStatus,
  Workflow,
  WorkflowInput,
  WorkflowRun,
} from '@gen/api/types.gen';

/** The stable failure codes a run ends with (`failureCode`), each with words of its own in the console. */
export const FAILURE_CODES = [
  'session_failed',
  'session_deleted',
  'session_missing',
  'ended_without_delivery',
  'repository_missing',
  'starter_unavailable',
  'wait_cancelled',
  'wait_missing',
  'max_total_visits',
  'max_depth',
  'workflow_missing',
  'invalid_arguments',
  'sub_workflow_failed',
  'sub_workflow_cancelled',
  'expired',
  'no_transition',
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

/** How a failure code reads: a key of the console's wording, and what it names (`max_visits:<node>` names its node). */
export interface FailureWords {
  readonly key: `workflows.runs.failureCode.${FailureCode | 'max_visits'}`;
  readonly node?: string;
}

/**
 * The words for a run's `failureCode`; undefined for a code the console does not know (the code of a refusal that
 * cannot be retried, or one a newer server adds), where the server's own sentence (`failure`) is shown instead.
 */
export function failureWords(code: string | undefined): FailureWords | undefined {
  if (code === undefined) return undefined;
  const known = FAILURE_CODES.find((candidate) => candidate === code);
  if (known !== undefined) return { key: `workflows.runs.failureCode.${known}` as const };
  const visits = /^max_visits:(.+)$/.exec(code);
  const node = visits?.[1];
  return node === undefined ? undefined : { key: 'workflows.runs.failureCode.max_visits', node };
}

/** The statuses a run goes through, in the order a person follows them. */
export const RUN_STATUSES: readonly RunStatus[] = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
];

/** A run that is over: nothing more happens to it, so nothing is asked of the server about it again. */
export function finished(run: WorkflowRun): boolean {
  return run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled';
}

/** The visit a run is at: the latest one still open. */
export function openVisit(run: WorkflowRun): NodeVisit | undefined {
  return run.visits?.findLast((visit) => visit.endedAt === undefined);
}

/**
 * The visit that waits for a delivery: the run is under way, and its latest open visit is an agent step. Whether the
 * caller may deliver (the starter) and what is asked (the node's deliverable) are the screen's to add.
 */
export function deliveryVisit(run: WorkflowRun): NodeVisit | undefined {
  if (finished(run)) return undefined;
  const visit = openVisit(run);
  return visit?.kind === 'agent' ? visit : undefined;
}

/** The deliverable the run's current agent step asks for, read from the workflow as it is now; undefined if none. */
export function deliverableOf(workflow: Workflow | undefined, visit: NodeVisit): Deliverable | undefined {
  return workflow?.nodes.find((node) => node.id === visit.nodeId)?.run?.deliverable;
}

/** What is wrong with a delivery, said before it is sent. */
export type DeliveryProblem =
  | 'empty'
  | 'artifact'
  | 'url'
  | 'urlSecure'
  | 'urlDomain'
  | 'json'
  | 'schema.type'
  | 'schema.required'
  | 'schema.enum';

export type Delivery =
  | { readonly ok: true; readonly output: unknown }
  | { readonly ok: false; readonly problem: DeliveryProblem; readonly detail?: string };

/** Whether `host` is `domain` or a subdomain of it. */
function onDomain(host: string, domain: string): boolean {
  const wanted = domain.toLowerCase();
  return host === wanted || host.endsWith(`.${wanted}`);
}

/** The JSON type a value has, as a schema names it. */
function jsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A value against the schema subset the server checks (`type`, an object's `properties` and `required`, an array's
 * `items`, a string's `enum`), the path of the first mismatch in `detail`.
 */
export function schemaProblem(
  schema: unknown,
  value: unknown,
  path = '$',
): { readonly problem: DeliveryProblem; readonly detail: string } | undefined {
  if (!isRecord(schema)) return undefined;
  const type = schema['type'];
  if (typeof type === 'string') {
    const actual = jsonType(value);
    // an integer is a number too
    if (actual !== type && !(type === 'number' && actual === 'integer'))
      return { problem: 'schema.type', detail: `${path}: ${type}` };
  }
  const allowed = schema['enum'];
  if (Array.isArray(allowed) && typeof value === 'string' && !allowed.includes(value))
    return { problem: 'schema.enum', detail: `${path}: ${allowed.map(String).join(', ')}` };
  if (isRecord(value)) {
    const required = schema['required'];
    if (Array.isArray(required))
      for (const name of required)
        if (typeof name === 'string' && !(name in value))
          return { problem: 'schema.required', detail: `${path}.${name}` };
    const properties = schema['properties'];
    if (isRecord(properties))
      for (const [name, sub] of Object.entries(properties)) {
        if (!(name in value)) continue;
        const found = schemaProblem(sub, value[name], `${path}.${name}`);
        if (found !== undefined) return found;
      }
  }
  if (Array.isArray(value)) {
    const items = schema['items'];
    for (const [at, item] of value.entries()) {
      const found = schemaProblem(items, item, `${path}[${String(at)}]`);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * What a person typed as the delivery of a step, checked as the server will (`Deliverables`): an artifact is its id
 * alone, a url is https and on the node's host when it names one, a text is not empty, a json parses and matches the
 * schema. The server checks it again: this only spares a round trip.
 */
export function deliveryOf(deliverable: Deliverable | undefined, text: string): Delivery {
  const written = text.trim();
  if (written === '') return { ok: false, problem: 'empty' };
  switch (deliverable?.type) {
    case 'artifact':
      return /^\S+$/.test(written) ? { ok: true, output: written } : { ok: false, problem: 'artifact' };
    case 'url': {
      let url: URL;
      try {
        url = new URL(written);
      } catch {
        return { ok: false, problem: 'url' };
      }
      if (url.protocol !== 'https:') return { ok: false, problem: 'urlSecure' };
      const domain = deliverable.domain;
      return domain !== undefined && !onDomain(url.hostname, domain)
        ? { ok: false, problem: 'urlDomain', detail: domain }
        : { ok: true, output: written };
    }
    case 'json': {
      let value: unknown;
      try {
        value = JSON.parse(written);
      } catch {
        return { ok: false, problem: 'json' };
      }
      const found = schemaProblem(deliverable.schema, value);
      return found === undefined ? { ok: true, output: value } : { ok: false, ...found };
    }
    case 'text':
    case undefined:
    default:
      // text, and what a newer server asks for that the console does not know: handed in as written
      return { ok: true, output: text };
  }
}

/** A start form's problem: the first required input left empty, or one longer than it allows. */
export interface StartProblem {
  readonly input: string;
  /** What the person reads the input as. */
  readonly label: string;
  readonly kind: 'required' | 'tooLong';
}

/** The inputs a person gave, as the run takes them: those written, trimmed of nothing; an empty one is left out. */
export function inputsOf(
  inputs: readonly WorkflowInput[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const given: Record<string, string> = {};
  for (const input of inputs) {
    const value = values[input.id] ?? input.default ?? '';
    if (value !== '') given[input.id] = value;
  }
  return given;
}

export function startProblem(
  inputs: readonly WorkflowInput[],
  values: Readonly<Record<string, string>>,
): StartProblem | undefined {
  const given = inputsOf(inputs, values);
  for (const input of inputs) {
    const value = given[input.id] ?? '';
    if (input.required === true && value.trim() === '')
      return { input: input.id, label: input.label, kind: 'required' };
    if (input.maxLength !== undefined && value.length > input.maxLength)
      return { input: input.id, label: input.label, kind: 'tooLong' };
  }
  return undefined;
}

/** Whether a repository reads `owner/name`. */
export function repositoryOk(text: string): boolean {
  return text === '' || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text);
}

/** Whether a workflow has an agent step that names no repository: the run then needs one. */
export function needsRepository(workflow: Workflow): boolean {
  return workflow.nodes.some(
    (node) => node.kind === 'agent' && (node.run?.repository === undefined || node.run.repository === ''),
  );
}
