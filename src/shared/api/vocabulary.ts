// SPDX-License-Identifier: Apache-2.0
import { zNodeVisit, zTodoItem, zWorkflowRun, zAnswerApprovalRequest, zReceiptNode } from '@gen/api/zod.gen';
import type {
  AnswerApprovalRequest,
  NodeVisit,
  ReceiptNode,
  TodoItem,
  WorkflowRun,
} from '@gen/api/types.gen';
import * as z from 'zod/mini';

/**
 * The words of the vocabularies the server document types as plain text (`status: string`). The console knows a few
 * of them to colour, filter and send; the server may say more (CS-04), so each stays open, as the generated enums are.
 * The vocabularies the document does declare (a run's status, a node's kind...) are read from it, not copied here.
 */

/** An open enum: the known values, and any other text a newer server sends. */
export type Open<T extends string> = T | (string & {});

function openEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.union([z.enum(values), z.string()]);
}

// Read from the generated document.
export type RunStatus = WorkflowRun['status'];
export const zRunStatus = zWorkflowRun.shape.status;
export type WorkflowNodeKind = NodeVisit['kind'];
export const zWorkflowNodeKind = zNodeVisit.shape.kind;
export type TodoItemStatus = TodoItem['status'];
export const zTodoItemStatus = zTodoItem.shape.status;
export type ApprovalAnswer = AnswerApprovalRequest['answer'];
export const zApprovalAnswer = zAnswerApprovalRequest.shape.answer;
export type CheckAttestation = NonNullable<ReceiptNode['attestation']>;
export const zCheckAttestation = zReceiptNode.shape.attestation;

// The console's own.
export const zRuleStatus = openEnum(['proposed', 'accepted', 'edited', 'rejected']);
export type RuleStatus = Open<'proposed' | 'accepted' | 'edited' | 'rejected'>;
export const zRuleStrength = openEnum(['required', 'recommended']);
export type RuleStrength = Open<'required' | 'recommended'>;
export const zWorkflowStatus = openEnum(['proposed', 'accepted', 'edited', 'rejected']);
export type WorkflowStatus = Open<'proposed' | 'accepted' | 'edited' | 'rejected'>;
export const zWaitStatus = openEnum(['open', 'resolved', 'cancelled']);
export type WaitStatus = Open<'open' | 'resolved' | 'cancelled'>;
/** Where a confirmation stands (`ConfirmationDto.status`, plain text in the document). */
export type ConfirmationStatus = Open<'pending' | 'confirmed' | 'refused' | 'expired' | 'failed'>;
export const zApprovalStatus = openEnum(['pending', 'approved', 'rejected', 'expired']);
export type ApprovalStatus = Open<'pending' | 'approved' | 'rejected' | 'expired'>;
export const zCheckState = openEnum(['success', 'failure', 'pending', 'skipped']);
export type CheckState = Open<'success' | 'failure' | 'pending' | 'skipped'>;
export const zCloudAgentKind = openEnum(['claude', 'codex', 'opencode', 'gemini', 'shell']);
export type CloudAgentKind = Open<'claude' | 'codex' | 'opencode' | 'gemini' | 'shell'>;
export const zGovernanceConfirmationAnswer = openEnum(['confirm', 'refuse']);
export type GovernanceConfirmationAnswer = Open<'confirm' | 'refuse'>;
export const zGovernanceChangeKind = openEnum([
  'rules.create',
  'rules.update',
  'rules.delete',
  'rules.bulk',
  'gates.policy',
  'models.policy',
  'workflows.create',
  'workflows.save',
  'workflows.delete',
  'members.role',
  'members.remove',
  'members.invite',
  'members.link',
  'budgets.set',
]);
export type GovernanceChangeKind = Open<
  | 'rules.create'
  | 'rules.update'
  | 'rules.delete'
  | 'rules.bulk'
  | 'gates.policy'
  | 'models.policy'
  | 'workflows.create'
  | 'workflows.save'
  | 'workflows.delete'
  | 'members.role'
  | 'members.remove'
  | 'members.invite'
  | 'members.link'
  | 'budgets.set'
>;
export const zPreparationPhase = openEnum([
  'securing_workspace',
  'configuring_git',
  'cloning_repositories',
  'fetching_repositories',
  'running_setup',
]);
export type PreparationPhase = Open<
  | 'securing_workspace'
  | 'configuring_git'
  | 'cloning_repositories'
  | 'fetching_repositories'
  | 'running_setup'
>;
export type ImportAction = Open<
  'planned' | 'created' | 'updated' | 'unchanged' | 'skipped' | 'revive_at_cutover'
>;
export type LinkState = Open<'linked' | 'reconnect_required' | 'not_linked'>;
