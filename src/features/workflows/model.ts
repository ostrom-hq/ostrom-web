// SPDX-License-Identifier: AGPL-3.0-only
import type {
  NodeRun,
  WaitSpec,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowStatus,
} from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';
import { type ConditionOp, type ConditionProblem, conditionProblem, type NodeCondition } from './nodes';

/** A proposed workflow waits for an owner: amber until someone accepts it. */
export const STATUS_TONES: Readonly<Record<WorkflowStatus, BadgeTone>> = {
  proposed: 'warning',
  accepted: 'success',
  edited: 'success',
};

export interface Step {
  readonly node: WorkflowNode;
  /** Where the flow goes after this step; `to: undefined` ends the workflow. */
  readonly next: readonly { readonly to: WorkflowNode | undefined; readonly edge: WorkflowEdge }[];
}

/**
 * The steps in the order a person reads them: from the start, following the edges breadth first (so a branch
 * shows right after the step it leaves), then any step no edge reaches, in the order the workflow lists them.
 */
export function readSteps(workflow: Workflow): Step[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const first = workflow.start ?? workflow.nodes[0]?.id;
  const order: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue = first === undefined ? [] : [first];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const node = byId.get(id);
    if (node === undefined || seen.has(id)) continue;
    seen.add(id);
    order.push(node);
    for (const edge of workflow.edges) if (edge.from === id && edge.to !== null) queue.push(edge.to);
  }
  for (const node of workflow.nodes) if (!seen.has(node.id)) order.push(node);
  return order.map((node) => ({
    node,
    next: workflow.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => ({ to: edge.to === null ? undefined : byId.get(edge.to), edge })),
  }));
}

/** How many steps ask a person, which the list shows next to each workflow. */
export function approvalSteps(workflow: Workflow): number {
  return workflow.nodes.filter((node) => node.kind === 'gate').length;
}

/**
 * The kinds a person picks for a step in the console, in the order the editor offers them: every kind of the contract
 * (a kind it adds is refused by `SHOWN` below until the editor says what it shows).
 */
export const EDITABLE_KINDS: readonly WorkflowNodeKind[] = [
  'trigger',
  'step',
  'check',
  'gate',
  'notify',
  'agent',
  'wait',
  'workflow',
];

/** A step as the editor holds it: the text of each field, and the node it was read from (kept on save). */
export interface StepDraft {
  /** Where the step stays on screen while it moves; never sent. */
  readonly key: number;
  readonly id: string;
  readonly kind: WorkflowNodeKind;
  readonly label: string;
  readonly detail: string;
  /** Logins, for a gate. */
  readonly approvers: string;
  /** What a step or a check runs. */
  readonly command: string;
  /** Where a notification goes, and what it says. */
  readonly channel: string;
  readonly message: string;
  /** What an agent step asks. */
  readonly instructions: string;
  /** A check's condition, field by field (all empty: no condition). */
  readonly conditionStep: string;
  readonly conditionPath: string;
  readonly conditionOp: ConditionOp;
  readonly conditionValue: string;
  /** The workflow a `workflow` step calls, by id. */
  readonly calls: string;
  /** The question a `wait` step asks a person (its `WaitSpec`: title and text; its fields and actions are kept). */
  readonly question: string;
  readonly questionBody: string;
  readonly base: WorkflowNode | undefined;
}

/** A node as the console reads and writes it: with the typed condition of a check (core, decision of 03/11). */
export type EditedNode = WorkflowNode & { readonly condition?: NodeCondition };

export interface WorkflowDraft {
  readonly name: string;
  readonly domain: string;
  readonly description: string;
  /** The repositories it is limited to (`repos`), as written; none: every repository of the organization. */
  readonly repos: readonly string[];
  readonly steps: readonly StepDraft[];
  /**
   * Whether the steps follow each other in one line. Only then does the editor add, remove and move steps (the line
   * is drawn again on save); a workflow that branches keeps its paths, and only its steps' text changes here.
   */
  readonly linear: boolean;
}

/**
 * Whether a workflow is one line: each step goes to the next one in reading order, the last one ends (or goes
 * nowhere), and no step has two ways out.
 */
export function isLinear(workflow: Workflow): boolean {
  const order = readSteps(workflow).map((step) => step.node.id);
  const froms = workflow.edges.map((edge) => edge.from);
  if (new Set(froms).size < froms.length) return false;
  const followed = workflow.edges.every((edge) => {
    const at = order.indexOf(edge.from);
    return at >= 0 && edge.to === (order[at + 1] ?? null);
  });
  return followed && order.slice(0, -1).every((id) => froms.includes(id));
}

function stepDraftOf(node: EditedNode, key: number): StepDraft {
  const condition = node.condition;
  return {
    key,
    id: node.id,
    kind: node.kind,
    label: node.label,
    detail: node.detail ?? '',
    approvers: (node.approvers ?? []).join(', '),
    command: node.run?.command ?? '',
    channel: node.run?.channel ?? '',
    message: node.run?.message ?? '',
    instructions: node.run?.instructions ?? '',
    conditionStep: condition?.step ?? '',
    conditionPath: condition?.path ?? '',
    conditionOp: condition?.op ?? 'equals',
    conditionValue: condition?.value ?? '',
    calls: node.workflowId ?? '',
    question: node.wait?.title ?? '',
    questionBody: node.wait?.body ?? '',
    base: node,
  };
}

/** A step not written yet, with an id no other step has. */
export function newStep(steps: readonly StepDraft[], kind: WorkflowNodeKind = 'step'): StepDraft {
  const key = steps.reduce((last, step) => Math.max(last, step.key), -1) + 1;
  const ids = new Set(steps.map((step) => step.id));
  let number = steps.length + 1;
  while (ids.has(`n-${String(number)}`)) number += 1;
  return {
    key,
    id: `n-${String(number)}`,
    kind,
    label: '',
    detail: '',
    approvers: '',
    command: '',
    channel: '',
    message: '',
    instructions: '',
    conditionStep: '',
    conditionPath: '',
    conditionOp: 'equals',
    conditionValue: '',
    calls: '',
    question: '',
    questionBody: '',
    base: undefined,
  };
}

/** The draft of a workflow, or of a new one: a single step where it starts. */
export function workflowDraftOf(workflow: Workflow | undefined): WorkflowDraft {
  if (workflow === undefined)
    return {
      name: '',
      domain: '',
      description: '',
      repos: [],
      steps: [newStep([], 'trigger')],
      linear: true,
    };
  return {
    name: workflow.name,
    domain: workflow.domain,
    description: workflow.description ?? '',
    repos: workflow.repos ?? [],
    steps: readSteps(workflow).map((step, key) => stepDraftOf(step.node, key)),
    linear: isLinear(workflow),
  };
}

/** The steps with one moved up (`-1`) or down (`1`); a step at either end stays. */
export function moveStep(steps: readonly StepDraft[], key: number, by: -1 | 1): StepDraft[] {
  const at = steps.findIndex((step) => step.key === key);
  const to = at + by;
  const moved = steps[at];
  const other = steps[to];
  if (moved === undefined || other === undefined) return [...steps];
  const next = [...steps];
  next[at] = other;
  next[to] = moved;
  return next;
}

export function listOf(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((value) => value !== ''))];
}

/** What keeps a workflow from being saved, in the order the editor says it. */
export type WorkflowProblem =
  'name' | 'domain' | 'noSteps' | 'label' | 'question' | 'call' | `condition.${ConditionProblem}`;

/** A check's condition as the draft says it, or undefined when none of its fields is written. */
export function conditionOf(step: StepDraft): NodeCondition | undefined {
  const written = [step.conditionStep, step.conditionPath, step.conditionValue].some(
    (field) => field.trim() !== '',
  );
  if (step.kind !== 'check' || !written) return undefined;
  const value = step.conditionValue;
  return {
    step: step.conditionStep.trim(),
    path: step.conditionPath.trim(),
    op: step.conditionOp,
    // exists compares nothing; any other op compares the value as written, an empty one included
    ...(step.conditionOp === 'exists' ? {} : { value }),
  };
}

export function workflowProblem(draft: WorkflowDraft): WorkflowProblem | undefined {
  if (draft.name.trim() === '') return 'name';
  if (draft.domain.trim() === '') return 'domain';
  if (draft.steps.length === 0) return 'noSteps';
  if (draft.steps.some((step) => step.label.trim() === '')) return 'label';
  if (draft.steps.some((step) => step.kind === 'wait' && step.question.trim() === '')) return 'question';
  if (draft.steps.some((step) => step.kind === 'workflow' && step.calls === '')) return 'call';
  for (const [at, step] of draft.steps.entries()) {
    const condition = conditionOf(step);
    const earlier = draft.steps.slice(0, at).map((before) => before.id);
    const problem = condition === undefined ? undefined : conditionProblem(condition, earlier);
    if (problem !== undefined) return `condition.${problem}`;
  }
  return undefined;
}

/** A gate nobody may approve holds an agent for good: the editor says so, and lets it be saved (it may be on purpose). */
export function nobodyApproves(step: StepDraft): boolean {
  return step.kind === 'gate' && listOf(step.approvers).length === 0;
}

function textOf(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The fields of `run` the editor shows for each kind (a wait, a check's condition and a call have their own). */
const SHOWN: Readonly<
  Record<WorkflowNodeKind, readonly ('command' | 'channel' | 'message' | 'instructions')[]>
> = {
  trigger: [],
  step: ['command'],
  check: ['command'],
  gate: [],
  notify: ['channel', 'message'],
  agent: ['instructions'],
  wait: [],
  workflow: [],
};

/**
 * What the step runs, its other settings (where, timeout, network…) kept as they were. A field its kind does not show
 * goes (a step turned into a notification sends no command), except on a kind the editor does not change.
 */
function runOf(step: StepDraft): NodeRun | undefined {
  const base = step.base?.run ?? {};
  const kind = step.kind;
  const field = (name: 'command' | 'channel' | 'message' | 'instructions'): string | undefined =>
    SHOWN[kind].includes(name) ? textOf(step[name]) : undefined;
  const command = field('command');
  const channel = field('channel');
  const message = field('message');
  const instructions = field('instructions');
  const run: NodeRun = {
    ...(base.on === undefined ? {} : { on: base.on }),
    ...(base.timeoutSec === undefined ? {} : { timeoutSec: base.timeoutSec }),
    ...(base.where === undefined ? {} : { where: base.where }),
    ...(base.network === undefined ? {} : { network: base.network }),
    ...(base.agent === undefined ? {} : { agent: base.agent }),
    ...(base.model === undefined ? {} : { model: base.model }),
    ...(base.deliverable === undefined ? {} : { deliverable: base.deliverable }),
    ...(command === undefined ? {} : { command }),
    ...(channel === undefined ? {} : { channel }),
    ...(message === undefined ? {} : { message }),
    ...(instructions === undefined ? {} : { instructions }),
  };
  return Object.keys(run).length === 0 ? undefined : run;
}

/**
 * The node a step says. What the editor does not show is kept from the node it was read from (rules, hours,
 * position, the wait form, the called workflow…); what only a gate has goes when the step is no longer a gate.
 */
export function nodeOf(step: StepDraft): EditedNode {
  const base: EditedNode | undefined = step.base;
  const gate = step.kind === 'gate';
  const condition = conditionOf(step);
  const questionBody = textOf(step.questionBody);
  // a wait asks its question (title and text, written here); its fields, actions and links stay as they were
  const asked = base?.wait;
  const wait: WaitSpec | undefined =
    step.kind === 'wait'
      ? {
          title: step.question.trim(),
          ...(questionBody === undefined ? {} : { body: questionBody }),
          ...(asked?.fields === undefined ? {} : { fields: asked.fields }),
          ...(asked?.actions === undefined ? {} : { actions: asked.actions }),
          ...(asked?.refs === undefined ? {} : { refs: asked.refs }),
        }
      : undefined;
  const approvers = listOf(step.approvers);
  const detail = textOf(step.detail);
  const run = runOf(step);
  return {
    id: step.id,
    kind: step.kind,
    label: step.label.trim(),
    ...(detail === undefined ? {} : { detail }),
    ...(gate && approvers.length > 0 ? { approvers } : {}),
    ...(run === undefined ? {} : { run }),
    ...(condition === undefined ? {} : { condition }),
    ...(step.kind === 'workflow' && step.calls !== '' ? { workflowId: step.calls } : {}),
    ...(wait === undefined ? {} : { wait }),
    ...(base === undefined
      ? {}
      : {
          ...(gate && base.owner !== undefined ? { owner: base.owner } : {}),
          ...(gate && base.approverReason !== undefined ? { approverReason: base.approverReason } : {}),
          ...(gate && base.actions !== undefined ? { actions: base.actions } : {}),
          ...(gate && base.actionsBy !== undefined ? { actionsBy: base.actionsBy } : {}),
          ...(gate && base.actionsAt !== undefined ? { actionsAt: base.actionsAt } : {}),
          ...(base.when === undefined ? {} : { when: base.when }),
          ...(base.ruleIds === undefined ? {} : { ruleIds: base.ruleIds }),
          ...(base.position === undefined ? {} : { position: base.position }),
          ...(base.suggested === undefined ? {} : { suggested: base.suggested }),
          ...(base.arguments === undefined ? {} : { arguments: base.arguments }),
          ...(base.maxVisits === undefined ? {} : { maxVisits: base.maxVisits }),
        }),
  };
}

/**
 * The paths: one line through the steps, in their order, for a linear draft (an edge keeps its label while it still
 * goes to the same step); the workflow's own paths, untouched, for one that branches.
 */
export function edgesOf(draft: WorkflowDraft, base: Workflow | undefined): WorkflowEdge[] {
  if (
    base !== undefined &&
    (!draft.linear ||
      sameValue(
        draft.steps.map((step) => step.id),
        readSteps(base).map((step) => step.node.id),
      ))
  )
    return base.edges;
  // The last step ends the way the workflow wrote it: by a path to nowhere, or by no path at all.
  const endsByPath = base === undefined || base.edges.some((edge) => edge.to === null);
  const steps = endsByPath ? draft.steps : draft.steps.slice(0, -1);
  return steps.map((step, at) => {
    const to = draft.steps[at + 1]?.id ?? null;
    const before = base?.edges.find((edge) => edge.from === step.id && edge.to === to);
    return {
      from: step.id,
      to,
      ...(before?.label === undefined ? {} : { label: before.label }),
      ...(before?.on === undefined ? {} : { on: before.on }),
    };
  });
}

/** Whether two values read the same, whatever the order of their keys; an absent key and an undefined one are alike. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item: unknown, at) => sameValue(item, b[at]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameValue(Reflect.get(a, key), Reflect.get(b, key)));
  }
  return a === b;
}

/** An id for a new workflow from its name, that no workflow of the organization has. */
export function workflowIdFor(name: string, taken: readonly string[]): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-|-$/g, '');
  const stem = `wf-${slug === '' ? 'workflow' : slug}`;
  let id = stem;
  for (let number = 2; taken.includes(id); number += 1) id = `${stem}-${String(number)}`;
  return id;
}

/** The node a step was read from, when nobody changed any of its fields. */
function untouched(step: StepDraft): WorkflowNode | undefined {
  if (step.base === undefined) return undefined;
  return sameValue({ ...stepDraftOf(step.base, step.key) }, { ...step }) ? step.base : undefined;
}

/** A new workflow is accepted as written; a proposed one is accepted, with changes when it has some; else it stays. */
function statusOf(base: Workflow | undefined, changed: boolean): WorkflowStatus {
  if (base === undefined) return 'accepted';
  if (base.status !== 'proposed') return base.status;
  return changed ? 'edited' : 'accepted';
}

/**
 * The workflow a draft says. A new one is accepted as it is written (a person in the console decides); a proposed one
 * that a person saves is accepted, with changes when it has some; an accepted one stays as it was called.
 */
export function workflowOf(
  draft: WorkflowDraft,
  base: Workflow | undefined,
  id: string,
  now: string,
): Workflow {
  const description =
    base !== undefined && draft.description === (base.description ?? '')
      ? base.description
      : textOf(draft.description);
  const first = draft.steps[0]?.id;
  // A workflow that names no start begins where its reading begins: it names one only once that changes.
  const start =
    !draft.linear || (base !== undefined && base.start === undefined && first === readSteps(base)[0]?.node.id)
      ? base?.start
      : first;
  // The steps keep their place in the workflow's list (its order is the paths'); a new one comes after.
  const place = (id: string): number => {
    const at = base?.nodes.findIndex((node) => node.id === id) ?? -1;
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  const nodes = draft.steps
    .map((step, at) => ({ node: untouched(step) ?? nodeOf(step), at }))
    .sort((a, b) => {
      const byPlace = place(a.node.id) - place(b.node.id);
      return byPlace === 0 ? a.at - b.at : byPlace;
    })
    .map(({ node }) => node);
  const edges = edgesOf(draft, base);
  // Repositories left as they were go back as read; none chosen sends no field, which means all of them.
  const repos = sameValue(draft.repos, base?.repos ?? []) ? base?.repos : [...draft.repos];
  const name = draft.name === base?.name ? base.name : draft.name.trim();
  const domain = draft.domain === base?.domain ? base.domain : draft.domain.trim();
  // What nobody touched goes back as it was read, so a workflow saved untouched is the very same workflow.
  const changed =
    base === undefined ||
    !sameValue(
      [name, domain, description, repos, start, nodes, edges],
      [base.name, base.domain, base.description, base.repos, base.start, base.nodes, base.edges],
    );
  const status: WorkflowStatus = statusOf(base, changed);
  return {
    id,
    name,
    domain,
    ...(description === undefined ? {} : { description }),
    ...(base?.version === undefined ? {} : { version: base.version }),
    ...(repos === undefined || repos.length === 0 ? {} : { repos }),
    nodes,
    edges,
    ...(start === undefined ? {} : { start }),
    ...(base?.inputs === undefined ? {} : { inputs: base.inputs }),
    ...(base?.sources === undefined ? {} : { sources: base.sources }),
    status,
    foundAt: base?.foundAt ?? now,
  };
}

/**
 * The repositories a workflow is limited to, or undefined when it names none: the server then applies it to every
 * repository of the organization its gates or its words point to (audit of the runner 2, R6).
 */
export function reposOf(workflow: Workflow): readonly string[] | undefined {
  const repos = workflow.repos ?? [];
  return repos.length === 0 ? undefined : repos;
}

/**
 * What the console writes for a repository of the organization: GitHub lists it by its name alone, and the console
 * does not know the owner, so `*` stands for it (the server allows `*` for any part of a name).
 */
export function repoPattern(name: string): string {
  return `*/${name}`;
}

/** How a repository reads: one the console wrote by its name, any other as it was written (`acme/api`, `acme/*`). */
export function repoLabel(pattern: string): string {
  return pattern.startsWith('*/') ? pattern.slice(2) : pattern;
}

/**
 * The repositories the editor offers: the organization's, by name, then the ones the workflow already names that
 * are not among them (written elsewhere, or no longer listed), so that a person may still take them out.
 */
export function repoChoices(names: readonly string[], chosen: readonly string[]): string[] {
  const listed = names.map(repoPattern);
  return [...new Set([...listed, ...chosen])];
}

/** The repositories chosen, with one added or taken out. */
export function toggleRepo(chosen: readonly string[], pattern: string): string[] {
  return chosen.includes(pattern) ? chosen.filter((other) => other !== pattern) : [...chosen, pattern];
}

/** The repositories of a limited workflow as one line, or undefined for one that names none. */
export function reposText(workflow: Workflow): string | undefined {
  return reposOf(workflow)
    ?.map((pattern) => repoLabel(pattern))
    .join(', ');
}
