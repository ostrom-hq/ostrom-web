// SPDX-License-Identifier: AGPL-3.0-only
import type {
  NodeRun,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowStatus,
} from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

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

/** The kinds a person picks for a step in the console; a `wait` or a `workflow` step keeps its kind. */
export const EDITABLE_KINDS = ['trigger', 'step', 'check', 'gate', 'notify', 'agent'] as const;
export type EditableKind = (typeof EDITABLE_KINDS)[number];

export function isEditableKind(kind: WorkflowNodeKind): kind is EditableKind {
  return EDITABLE_KINDS.some((editable) => editable === kind);
}

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
  readonly base: WorkflowNode | undefined;
}

export interface WorkflowDraft {
  readonly name: string;
  readonly domain: string;
  readonly description: string;
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

function stepDraftOf(node: WorkflowNode, key: number): StepDraft {
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
    base: node,
  };
}

/** A step not written yet, with an id no other step has. */
export function newStep(steps: readonly StepDraft[], kind: EditableKind = 'step'): StepDraft {
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
    base: undefined,
  };
}

/** The draft of a workflow, or of a new one: a single step where it starts. */
export function workflowDraftOf(workflow: Workflow | undefined): WorkflowDraft {
  if (workflow === undefined)
    return { name: '', domain: '', description: '', steps: [newStep([], 'trigger')], linear: true };
  return {
    name: workflow.name,
    domain: workflow.domain,
    description: workflow.description ?? '',
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
export type WorkflowProblem = 'name' | 'domain' | 'noSteps' | 'label';

export function workflowProblem(draft: WorkflowDraft): WorkflowProblem | undefined {
  if (draft.name.trim() === '') return 'name';
  if (draft.domain.trim() === '') return 'domain';
  if (draft.steps.length === 0) return 'noSteps';
  if (draft.steps.some((step) => step.label.trim() === '')) return 'label';
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

/** The fields the editor shows for each kind; a wait or a called workflow shows none and keeps its own. */
const SHOWN: Readonly<Record<EditableKind, readonly ('command' | 'channel' | 'message' | 'instructions')[]>> =
  {
    trigger: [],
    step: ['command'],
    check: ['command'],
    gate: [],
    notify: ['channel', 'message'],
    agent: ['instructions'],
  };

/**
 * What the step runs, its other settings (where, timeout, network…) kept as they were. A field its kind does not show
 * goes (a step turned into a notification sends no command), except on a kind the editor does not change.
 */
function runOf(step: StepDraft): NodeRun | undefined {
  const base = step.base?.run ?? {};
  const kind = step.kind;
  const field = (name: 'command' | 'channel' | 'message' | 'instructions'): string | undefined =>
    isEditableKind(kind) ? (SHOWN[kind].includes(name) ? textOf(step[name]) : undefined) : base[name];
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
export function nodeOf(step: StepDraft): WorkflowNode {
  const base = step.base;
  const gate = step.kind === 'gate';
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
          ...(base.wait === undefined ? {} : { wait: base.wait }),
          ...(base.workflowId === undefined ? {} : { workflowId: base.workflowId }),
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
  if (!draft.linear && base !== undefined) return base.edges;
  return draft.steps.map((step, at) => {
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

/** An id for a new workflow from its name, that no workflow of the organization has. */
export function workflowIdFor(name: string, taken: readonly string[]): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const stem = `wf-${slug === '' ? 'workflow' : slug}`;
  let id = stem;
  for (let number = 2; taken.includes(id); number += 1) id = `${stem}-${String(number)}`;
  return id;
}

/**
 * The workflow a draft says. A new one is accepted as it is written (a person in the console decides); a proposed one
 * that a person edits is accepted with changes; an accepted one stays as it was called.
 */
export function workflowOf(
  draft: WorkflowDraft,
  base: Workflow | undefined,
  id: string,
  now: string,
): Workflow {
  const description = textOf(draft.description);
  const status: WorkflowStatus =
    base === undefined ? 'accepted' : base.status === 'proposed' ? 'edited' : base.status;
  const start = draft.linear ? draft.steps[0]?.id : base?.start;
  return {
    id,
    name: draft.name.trim(),
    domain: draft.domain.trim(),
    ...(description === undefined ? {} : { description }),
    ...(base?.version === undefined ? {} : { version: base.version }),
    nodes: draft.steps.map(nodeOf),
    edges: edgesOf(draft, base),
    ...(start === undefined ? {} : { start }),
    ...(base?.inputs === undefined ? {} : { inputs: base.inputs }),
    ...(base?.sources === undefined ? {} : { sources: base.sources }),
    status,
    foundAt: base?.foundAt ?? now,
  };
}
