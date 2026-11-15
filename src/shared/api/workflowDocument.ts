// SPDX-License-Identifier: Apache-2.0
import * as z from 'zod/mini';
import { zWorkflowNodeKind, zWorkflowStatus } from '@/shared/api/vocabulary';
import type { WorkflowNodeKind, WorkflowStatus } from '@/shared/api/vocabulary';

/**
 * A workflow, as the console reads it. The server's document types a workflow as a free JSON object
 * (`{ [key: string]: JsonElement }`) and declares neither its fields nor its nodes, so the console states what it
 * reads of it here and checks it at the edge (`readWorkflow`), instead of trusting the shape.
 */

export interface Workflow {
  /** The document is a free JSON object on the wire: it stays assignable to one. */
  [key: string]: unknown;
  id: string;
  name: string;
  domain: string;
  description?: string | undefined;
  version?: number | undefined;
  repos?: string[] | undefined;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  start?: string | undefined;
  inputs?: WorkflowInput[] | undefined;
  sessionMode?: string | undefined;
  limits?: WorkflowLimits | undefined;
  sources?: RuleSource[] | undefined;
  status: WorkflowStatus;
  foundAt: string;
  updatedAt?: string | undefined;
  updatedBy?: string | undefined;
}

export interface RuleSource {
  kind: string;
  ref: string;
  url?: string | undefined;
}

export interface WorkflowLimits {
  maxNodes?: number | undefined;
  maxVisits?: number | undefined;
  maxDepth?: number | undefined;
}

export interface WorkflowInput {
  id: string;
  label: string;
  required?: boolean | undefined;
  default?: string | undefined;
  maxLength?: number | undefined;
}

export interface WorkflowEdge {
  from: string;
  to: string | null;
  label?: string | undefined;
  on?: string | undefined;
}

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  detail?: string | undefined;
  owner?: string | undefined;
  approvers?: string[] | undefined;
  approverReason?: string | undefined;
  when?: NodeWhen | undefined;
  ruleIds?: string[] | undefined;
  position?: NodePosition | undefined;
  actions?: GateAction[] | undefined;
  actionsBy?: string | undefined;
  actionsAt?: string | undefined;
  run?: NodeRun | undefined;
  suggested?: NodeSuggestions | undefined;
  wait?: WaitSpec | undefined;
  workflowId?: string | undefined;
  arguments?: Record<string, string> | undefined;
  maxVisits?: number | undefined;
  condition?: NodeCondition | undefined;
}

export interface NodeCondition {
  step: string;
  path: string;
  op: NodeConditionOp;
  value?: string | undefined;
}

export type NodeConditionOp = 'equals' | 'notEquals' | 'exists' | 'matches' | (string & {});

export interface WaitSpec {
  title: string;
  body?: string | undefined;
  fields?: WaitField[] | undefined;
  actions?: WaitAction[] | undefined;
  refs?: WaitRef[] | undefined;
}

export interface WaitRef {
  kind: string;
  id?: string | undefined;
  url?: string | undefined;
  title?: string | undefined;
}

export interface WaitAction {
  id: string;
  label: string;
  requires?: string[] | undefined;
  style?: string | undefined;
}

export interface WaitField {
  id: string;
  type: string;
  label: string;
  help?: string | undefined;
  required?: boolean | undefined;
  default?: unknown;
  options?: string[] | undefined;
  multiple?: boolean | undefined;
  allowOther?: boolean | undefined;
  maxLength?: number | undefined;
  oneTime?: boolean | undefined;
}

export interface NodeSuggestions {
  command?: StringSuggestion | undefined;
  on?: StringListSuggestion | undefined;
  actions?: StringListSuggestion | undefined;
  channel?: StringSuggestion | undefined;
  ruleIds?: StringListSuggestion | undefined;
  dismissed?: string[] | undefined;
}

export interface StringListSuggestion {
  value: string[];
  evidence: string[];
  excerpt?: string | undefined;
  why?: string | undefined;
  by?: string | undefined;
  at: string;
}

export interface StringSuggestion {
  value: string;
  evidence: string[];
  excerpt?: string | undefined;
  why?: string | undefined;
  by?: string | undefined;
  at: string;
}

export interface NodeRun {
  on?: NodeRunOn | undefined;
  command?: string | undefined;
  timeoutSec?: number | undefined;
  where?: RunLocation | undefined;
  network?: boolean | undefined;
  channel?: string | undefined;
  message?: string | undefined;
  instructions?: string | undefined;
  agent?: string | undefined;
  model?: string | undefined;
  deliverable?: Deliverable | undefined;
  repository?: string | undefined;
  profileId?: string | undefined;
}

export interface Deliverable {
  type: string;
  label?: string | undefined;
  schema?: unknown;
  domain?: string | undefined;
}

export type RunLocation = 'workstation' | 'ostrom' | (string & {});

export interface NodeRunOn {
  classes?: string[] | undefined;
  patterns?: string[] | undefined;
}

export interface GateAction {
  class: string;
  label: string;
  patterns: string[];
  repos?: string[] | undefined;
  tools?: string[] | undefined;
  keywords?: string[] | undefined;
  gate?: GateRef | null | undefined;
}

export interface GateRef {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  label: string;
  approvers: string[];
  status: WorkflowStatus;
  enforce: boolean;
  basis?: string | undefined;
  reason: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeWhen {
  hours?: string | undefined;
  days?: string | undefined;
  risk?: RiskLevel | undefined;
}

export type RiskLevel = 'low' | 'medium' | 'high' | (string & {});

/** An optional field: absent, or null as the server writes an absent one, both read as absent. */
function optional<T extends z.core.SomeType>(schema: T) {
  return z.pipe(
    z.optional(z.nullable(schema)),
    z.transform((value: z.output<T> | null | undefined) => value ?? undefined),
  );
}

export const zDeliverable = z.looseObject({
  type: z.string(),
  label: optional(z.string()),
  schema: optional(z.unknown()),
  domain: optional(z.string()),
});

export const zNodeConditionOp = z.union([z.enum(['equals', 'notEquals', 'exists', 'matches']), z.string()]);

export const zNodeCondition = z.looseObject({
  step: z.string().check(z.maxLength(200)),
  path: z.string().check(z.maxLength(200)),
  op: zNodeConditionOp,
  value: optional(z.string().check(z.maxLength(200))),
});

export const zNodePosition = z.looseObject({
  x: z.number(),
  y: z.number(),
});

export const zNodeRunOn = z.looseObject({
  classes: optional(z.array(z.string())),
  patterns: optional(z.array(z.string())),
});

export const zRiskLevel = z.union([z.enum(['low', 'medium', 'high']), z.string()]);

export const zNodeWhen = z.looseObject({
  hours: optional(z.string()),
  days: optional(z.string()),
  risk: optional(zRiskLevel),
});

export const zRuleSource = z.looseObject({
  kind: z.string(),
  ref: z.string(),
  url: optional(z.string()),
});

export const zRunLocation = z.union([z.enum(['workstation', 'ostrom']), z.string()]);

export const zNodeRun = z.looseObject({
  on: optional(zNodeRunOn),
  command: optional(z.string()),
  timeoutSec: optional(z.int()),
  where: optional(zRunLocation),
  network: optional(z.boolean()),
  channel: optional(z.string()),
  message: optional(z.string()),
  instructions: optional(z.string()),
  agent: optional(z.string()),
  model: optional(z.string()),
  deliverable: optional(zDeliverable),
  repository: optional(z.string()),
  profileId: optional(z.string()),
});

export const zStringListSuggestion = z.looseObject({
  value: z.array(z.string()),
  evidence: z.array(z.string()),
  excerpt: optional(z.string()),
  why: optional(z.string()),
  by: optional(z.string()),
  at: z.string(),
});

export const zStringSuggestion = z.looseObject({
  value: z.string(),
  evidence: z.array(z.string()),
  excerpt: optional(z.string()),
  why: optional(z.string()),
  by: optional(z.string()),
  at: z.string(),
});

export const zNodeSuggestions = z.looseObject({
  command: optional(zStringSuggestion),
  on: optional(zStringListSuggestion),
  actions: optional(zStringListSuggestion),
  channel: optional(zStringSuggestion),
  ruleIds: optional(zStringListSuggestion),
  dismissed: optional(z.array(z.string())),
});

export const zWaitAction = z.looseObject({
  id: z.string(),
  label: z.string(),
  requires: optional(z.array(z.string())),
  style: optional(z.string()),
});

export const zWaitField = z.looseObject({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  help: optional(z.string()),
  required: optional(z.boolean()),
  default: optional(z.unknown()),
  options: optional(z.array(z.string())),
  multiple: optional(z.boolean()),
  allowOther: optional(z.boolean()),
  maxLength: optional(z.int()),
  oneTime: optional(z.boolean()),
});

export const zWaitRef = z.looseObject({
  kind: z.string(),
  id: optional(z.string()),
  url: optional(z.string()),
  title: optional(z.string()),
});

export const zWaitSpec = z.looseObject({
  title: z.string(),
  body: optional(z.string()),
  fields: optional(z.array(zWaitField)),
  actions: optional(z.array(zWaitAction)),
  refs: optional(z.array(zWaitRef)),
});

export const zWorkflowEdge = z.looseObject({
  from: z.string(),
  to: z.nullable(z.string()),
  label: optional(z.string()),
  on: optional(z.string()),
});

export const zWorkflowInput = z.looseObject({
  id: z.string(),
  label: z.string(),
  required: optional(z.boolean()),
  default: optional(z.string()),
  maxLength: optional(z.int()),
});

export const zWorkflowLimits = z.looseObject({
  maxNodes: optional(z.int()),
  maxVisits: optional(z.int()),
  maxDepth: optional(z.int()),
});

export const zGateRef = z.looseObject({
  workflowId: z.string(),
  workflowName: z.string(),
  nodeId: z.string(),
  label: z.string(),
  approvers: z.array(z.string()),
  status: zWorkflowStatus,
  enforce: z.boolean(),
  basis: optional(z.string()),
  reason: z.string(),
});

export const zGateAction = z.looseObject({
  class: z.string(),
  label: z.string(),
  patterns: z.array(z.string()),
  repos: optional(z.array(z.string())),
  tools: optional(z.array(z.string())),
  keywords: optional(z.array(z.string())),
  gate: z.nullish(zGateRef),
});

export const zWorkflowNode = z.looseObject({
  id: z.string(),
  kind: zWorkflowNodeKind,
  label: z.string(),
  detail: optional(z.string()),
  owner: optional(z.string()),
  approvers: optional(z.array(z.string())),
  approverReason: optional(z.string()),
  when: optional(zNodeWhen),
  ruleIds: optional(z.array(z.string())),
  position: optional(zNodePosition),
  actions: optional(z.array(zGateAction)),
  actionsBy: optional(z.string()),
  actionsAt: optional(z.string()),
  run: optional(zNodeRun),
  suggested: optional(zNodeSuggestions),
  wait: optional(zWaitSpec),
  workflowId: optional(z.string()),
  arguments: optional(z.record(z.string(), z.string())),
  maxVisits: optional(z.int()),
  condition: optional(zNodeCondition),
});

export const zWorkflow = z.looseObject({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: optional(z.string()),
  version: optional(z.int()),
  repos: optional(z.array(z.string())),
  nodes: z.array(zWorkflowNode),
  edges: z.array(zWorkflowEdge),
  start: optional(z.string()),
  inputs: optional(z.array(zWorkflowInput)),
  sessionMode: optional(z.string()),
  limits: optional(zWorkflowLimits),
  sources: optional(z.array(zRuleSource)),
  status: zWorkflowStatus,
  foundAt: z.string(),
  updatedAt: optional(z.string()),
  updatedBy: optional(z.string()),
});

/**
 * The workflow a document holds, or `undefined` when the document is not one the console can read. A field the
 * console does not know is kept (loose objects), so saving the workflow back never drops what a newer server wrote.
 */
export function readWorkflow(document: unknown): Workflow | undefined {
  const parsed = zWorkflow.safeParse(document);
  return parsed.success ? parsed.data : undefined;
}
