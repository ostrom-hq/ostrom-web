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

export const zDeliverable = z.object({
  type: z.string(),
  label: z.optional(z.string()),
  schema: z.optional(z.unknown()),
  domain: z.optional(z.string()),
});

export const zNodeConditionOp = z.union([z.enum(['equals', 'notEquals', 'exists', 'matches']), z.string()]);

export const zNodeCondition = z.object({
  step: z.string().check(z.maxLength(200)),
  path: z.string().check(z.maxLength(200)),
  op: zNodeConditionOp,
  value: z.optional(z.string().check(z.maxLength(200))),
});

export const zNodePosition = z.object({
  x: z.number(),
  y: z.number(),
});

export const zNodeRunOn = z.object({
  classes: z.optional(z.array(z.string())),
  patterns: z.optional(z.array(z.string())),
});

export const zRiskLevel = z.union([z.enum(['low', 'medium', 'high']), z.string()]);

export const zNodeWhen = z.object({
  hours: z.optional(z.string()),
  days: z.optional(z.string()),
  risk: z.optional(zRiskLevel),
});

export const zRuleSource = z.object({
  kind: z.string(),
  ref: z.string(),
  url: z.optional(z.string()),
});

export const zRunLocation = z.union([z.enum(['workstation', 'ostrom']), z.string()]);

export const zNodeRun = z.object({
  on: z.optional(zNodeRunOn),
  command: z.optional(z.string()),
  timeoutSec: z.optional(z.int()),
  where: z.optional(zRunLocation),
  network: z.optional(z.boolean()),
  channel: z.optional(z.string()),
  message: z.optional(z.string()),
  instructions: z.optional(z.string()),
  agent: z.optional(z.string()),
  model: z.optional(z.string()),
  deliverable: z.optional(zDeliverable),
  repository: z.optional(z.string()),
  profileId: z.optional(z.uuid()),
});

export const zStringListSuggestion = z.object({
  value: z.array(z.string()),
  evidence: z.array(z.string()),
  excerpt: z.optional(z.string()),
  why: z.optional(z.string()),
  by: z.optional(z.string()),
  at: z.string(),
});

export const zStringSuggestion = z.object({
  value: z.string(),
  evidence: z.array(z.string()),
  excerpt: z.optional(z.string()),
  why: z.optional(z.string()),
  by: z.optional(z.string()),
  at: z.string(),
});

export const zNodeSuggestions = z.object({
  command: z.optional(zStringSuggestion),
  on: z.optional(zStringListSuggestion),
  actions: z.optional(zStringListSuggestion),
  channel: z.optional(zStringSuggestion),
  ruleIds: z.optional(zStringListSuggestion),
  dismissed: z.optional(z.array(z.string())),
});

export const zWaitAction = z.object({
  id: z.string(),
  label: z.string(),
  requires: z.optional(z.array(z.string())),
  style: z.optional(z.string()),
});

export const zWaitField = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  help: z.optional(z.string()),
  required: z.optional(z.boolean()),
  default: z.optional(z.unknown()),
  options: z.optional(z.array(z.string())),
  multiple: z.optional(z.boolean()),
  allowOther: z.optional(z.boolean()),
  maxLength: z.optional(z.int()),
  oneTime: z.optional(z.boolean()),
});

export const zWaitRef = z.object({
  kind: z.string(),
  id: z.optional(z.string()),
  url: z.optional(z.string()),
  title: z.optional(z.string()),
});

export const zWaitSpec = z.object({
  title: z.string(),
  body: z.optional(z.string()),
  fields: z.optional(z.array(zWaitField)),
  actions: z.optional(z.array(zWaitAction)),
  refs: z.optional(z.array(zWaitRef)),
});

export const zWorkflowEdge = z.object({
  from: z.string(),
  to: z.nullable(z.string()),
  label: z.optional(z.string()),
  on: z.optional(z.string()),
});

export const zWorkflowInput = z.object({
  id: z.string(),
  label: z.string(),
  required: z.optional(z.boolean()),
  default: z.optional(z.string()),
  maxLength: z.optional(z.int()),
});

export const zWorkflowLimits = z.object({
  maxNodes: z.optional(z.int()),
  maxVisits: z.optional(z.int()),
  maxDepth: z.optional(z.int()),
});

export const zGateRef = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  nodeId: z.string(),
  label: z.string(),
  approvers: z.array(z.string()),
  status: zWorkflowStatus,
  enforce: z.boolean(),
  basis: z.optional(z.string()),
  reason: z.string(),
});

export const zGateAction = z.object({
  class: z.string(),
  label: z.string(),
  patterns: z.array(z.string()),
  repos: z.optional(z.array(z.string())),
  tools: z.optional(z.array(z.string())),
  keywords: z.optional(z.array(z.string())),
  gate: z.nullish(zGateRef),
});

export const zWorkflowNode = z.object({
  id: z.string(),
  kind: zWorkflowNodeKind,
  label: z.string(),
  detail: z.optional(z.string()),
  owner: z.optional(z.string()),
  approvers: z.optional(z.array(z.string())),
  approverReason: z.optional(z.string()),
  when: z.optional(zNodeWhen),
  ruleIds: z.optional(z.array(z.string())),
  position: z.optional(zNodePosition),
  actions: z.optional(z.array(zGateAction)),
  actionsBy: z.optional(z.string()),
  actionsAt: z.optional(z.string()),
  run: z.optional(zNodeRun),
  suggested: z.optional(zNodeSuggestions),
  wait: z.optional(zWaitSpec),
  workflowId: z.optional(z.string()),
  arguments: z.optional(z.record(z.string(), z.string())),
  maxVisits: z.optional(z.int()),
  condition: z.optional(zNodeCondition),
});

export const zWorkflow = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: z.optional(z.string()),
  version: z.optional(z.int()),
  repos: z.optional(z.array(z.string())),
  nodes: z.array(zWorkflowNode),
  edges: z.array(zWorkflowEdge),
  start: z.optional(z.string()),
  inputs: z.optional(z.array(zWorkflowInput)),
  sessionMode: z.optional(z.string()),
  limits: z.optional(zWorkflowLimits),
  sources: z.optional(z.array(zRuleSource)),
  status: zWorkflowStatus,
  foundAt: z.string(),
  updatedAt: z.optional(z.string()),
  updatedBy: z.optional(z.string()),
});

/** The workflow a document holds, or `undefined` when the document is not one the console can read. */
export function readWorkflow(document: unknown): Workflow | undefined {
  const parsed = zWorkflow.safeParse(document);
  return parsed.success ? parsed.data : undefined;
}
