// SPDX-License-Identifier: AGPL-3.0-only
import type { Ask } from '@gen/api/types.gen';

export interface DiffStats {
  readonly added: number;
  readonly removed: number;
}

export type DiffLineKind = 'added' | 'removed' | 'hunk' | 'file' | 'context';

export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) return 'file';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  if (line.startsWith('@@')) return 'hunk';
  return 'context';
}

export function diffStats(diff: string): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of diffLines(diff)) {
    const kind = diffLineKind(line);
    if (kind === 'added') added += 1;
    if (kind === 'removed') removed += 1;
  }
  return { added, removed };
}

/** Where a request stands for the person looking at it. */
export type AskTone = 'waiting-you' | 'waiting-other' | 'approved' | 'refused' | 'expired';

export function askTone(ask: Ask): AskTone {
  switch (ask.status) {
    case 'pending':
      return ask.you?.self === true && !ask.you.canApprove ? 'waiting-other' : 'waiting-you';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'refused';
    case 'expired':
      return 'expired';
  }
}

export interface Approvers {
  /** Who can say yes. */
  readonly eligible: readonly string[];
  /** Approvers of the gate who asked for the action themselves, so cannot say yes while someone else can. */
  readonly askers: readonly string[];
}

/** The prototype's rule, for display: the author is set aside unless nobody else can approve. */
export function approversOf(ask: Ask): Approvers {
  const approvers = ask.gate?.approvers ?? [];
  const asked = new Set(ask.askedBy.map((login) => login.toLowerCase()));
  const others = approvers.filter((login) => !asked.has(login.toLowerCase()));
  if (others.length === 0) return { eligible: approvers, askers: [] };
  return { eligible: others, askers: approvers.filter((login) => asked.has(login.toLowerCase())) };
}

const AGENTS: Readonly<Record<string, string>> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
};

export function agentLabel(agent: string | undefined): string | undefined {
  return agent === undefined ? undefined : (AGENTS[agent] ?? agent);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** The key id written in a receipt signature (`ed25519;kid=…;sha256=…;sig=…`). */
export function keyIdOf(signature: string): string | undefined {
  return /(?:^|;)kid=([0-9a-f]+)(?:;|$)/.exec(signature)?.[1];
}

/** A diff longer than this is folded, and the yes waits until the person has opened it whole. */
export const DIFF_FOLD_LINES = 40;

export function diffLines(diff: string): readonly string[] {
  return diff.split('\n');
}

/** The verb on the approve button says what will happen ("Approve merge"), never a bare "yes". */
export type ActionKind = 'push' | 'merge' | 'deployment' | 'other';

export function actionKind(ask: Ask): ActionKind {
  const text = `${ask.what.action ?? ''} ${ask.what.command ?? ''} ${ask.title}`;
  if (/\bmerge/i.test(text)) return 'merge';
  if (/\bdeploy/i.test(text)) return 'deployment';
  if (/\bpush/i.test(text)) return 'push';
  return 'other';
}
