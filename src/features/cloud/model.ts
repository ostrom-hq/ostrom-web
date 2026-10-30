// SPDX-License-Identifier: AGPL-3.0-only
import type { Automation, AutomationDryRun, AutomationRun, CloudSession } from '@gen/api/types.gen';
import type { BadgeTone } from '@/shared/ui/Badge';

export const CLOUD_AGENTS = ['claude-code', 'codex'] as const;
export type CloudAgent = (typeof CLOUD_AGENTS)[number];

export function isCloudAgent(value: string): value is CloudAgent {
  return CLOUD_AGENTS.some((agent) => agent === value);
}

export const CLOUD_STATUSES = ['queued', 'starting', 'running', 'ended', 'stopped', 'failed'] as const;
export type CloudStatus = (typeof CLOUD_STATUSES)[number];

/** The statuses the console has words for; another one is shown as the server wrote it. */
export function isCloudStatus(value: string): value is CloudStatus {
  return CLOUD_STATUSES.some((status) => status === value);
}

/** A session that still holds a runner, and so can be stopped. */
export function isLive(session: CloudSession): boolean {
  return session.status === 'queued' || session.status === 'starting' || session.status === 'running';
}

/** Green while it works, red when it failed; never garnet, which only ever means "approve" (PB-C2). */
export function sessionTone(status: string): BadgeTone {
  if (status === 'running') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'queued' || status === 'starting') return 'warning';
  return 'neutral';
}

/** The run states the contract names; any other is shown as the server wrote it. */
export const RUN_STATUSES = [
  'queued',
  'started',
  'failed',
  'invalid_payload',
  'skipped_overlap',
  'skipped_budget',
] as const;
export type KnownRunStatus = (typeof RUN_STATUSES)[number];

export function isKnownRunStatus(value: string): value is KnownRunStatus {
  return RUN_STATUSES.some((status) => status === value);
}

export const RUN_TONES: Readonly<Record<KnownRunStatus, BadgeTone>> = {
  queued: 'warning',
  started: 'success',
  failed: 'danger',
  invalid_payload: 'danger',
  skipped_overlap: 'neutral',
  skipped_budget: 'warning',
};

/** A dry run answers what it would do; a real run answers with the run it queued. */
export function isDryRun(answer: AutomationRun | AutomationDryRun): answer is AutomationDryRun {
  return 'renderedPrompt' in answer;
}

/** Who may stop a session or change an automation: its owner, or an owner or admin of the organization. */
export function mayChange(owner: string, viewer: string | undefined, canManage: boolean): boolean {
  return canManage || owner === viewer;
}

/** A session is named by its name, else by its agent and its id. */
export function sessionTitle(session: CloudSession): string {
  return session.name ?? `${session.agent} · ${session.id}`;
}

export function isWebhook(automation: Automation): boolean {
  return automation.trigger.kind === 'webhook';
}
