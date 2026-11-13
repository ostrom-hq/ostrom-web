// SPDX-License-Identifier: Apache-2.0
import type {
  CloudAgentKind,
  Automation,
  AutomationDryRun,
  AutomationRun,
  CloudSession,
} from '@gen/api/types.gen';
import { zCloudAgentKind } from '@gen/api/zod.gen';
import { z } from 'zod/mini';
import type { BadgeTone } from '@/shared/ui/Badge';

/**
 * The agents a cloud session starts, read from the contract (`CloudAgentKind`): the console never offers, and so never sends,
 * a name the server refuses. A new agent in the contract shows here at the next resync.
 */
export const CLOUD_AGENTS: readonly CloudAgentKind[] = zCloudAgentKind.options;
export type CloudAgent = CloudAgentKind;

export function isCloudAgent(value: string): value is CloudAgent {
  return zCloudAgentKind.safeParse(value).success;
}

/**
 * The agents that follow a prompt, the only ones this console starts (a session or an automation): the contract's but the
 * plain shell, which only an interactive terminal drives, and the console has none. `claude` is the server's default.
 */
export type PromptAgent = Exclude<CloudAgentKind, 'shell'>;
export const PROMPT_AGENTS: readonly PromptAgent[] = zCloudAgentKind.options.filter(
  (agent): agent is PromptAgent => agent !== 'shell',
);
const PROMPT_AGENT = z.enum(PROMPT_AGENTS);

export function isPromptAgent(value: string): value is PromptAgent {
  return PROMPT_AGENT.safeParse(value).success;
}

/** What a session's `githubAccess` may be: the owner only (the default), everyone who may use the session, or no token. */
export const GITHUB_ACCESS = ['owner', 'shared', 'none'] as const satisfies readonly NonNullable<
  CloudSession['githubAccess']
>[];
export type GithubAccess = (typeof GITHUB_ACCESS)[number];

/** The session's access as the server says it; a server without the feature sends none, which reads as the default. */
export function accessOf(session: CloudSession): GithubAccess {
  return session.githubAccess ?? 'owner';
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

/** The run states the contract names, with their tone; any other is shown as the server wrote it. */
export const RUN_TONES = {
  queued: 'warning',
  started: 'success',
  failed: 'danger',
  invalid_payload: 'danger',
  skipped_overlap: 'neutral',
  skipped_budget: 'warning',
} as const satisfies Readonly<Record<string, BadgeTone>>;
export type KnownRunStatus = keyof typeof RUN_TONES;

export function isKnownRunStatus(value: string): value is KnownRunStatus {
  return Object.hasOwn(RUN_TONES, value);
}

/** The reasons of a failed run the console has words for; the contract keeps the list open. */
export const RUN_REASONS = ['cloud_session_limit', 'cloud_hours_exhausted', 'owner_unavailable'] as const;
export type KnownRunReason = (typeof RUN_REASONS)[number];

export function isKnownRunReason(value: string): value is KnownRunReason {
  return RUN_REASONS.some((reason) => reason === value);
}

/** An idempotency key for one gesture, from the random source every context has (randomUUID needs https). */
export function idempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
