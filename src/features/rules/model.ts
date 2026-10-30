// SPDX-License-Identifier: AGPL-3.0-only
import type { Rule } from '@gen/api/types.gen';

/** What an owner looks at: what is left to decide first, then what was decided. */
export const RULE_FILTERS = ['todo', 'accepted', 'rejected', 'all'] as const;
export type RuleFilter = (typeof RULE_FILTERS)[number];

/** An edited rule was accepted with a fix: it counts as accepted. */
export function isAccepted(rule: Rule): boolean {
  return rule.status === 'accepted' || rule.status === 'edited';
}

export function matches(rule: Rule, filter: RuleFilter): boolean {
  switch (filter) {
    case 'todo':
      return rule.status === 'proposed';
    case 'accepted':
      return isAccepted(rule);
    case 'rejected':
      return rule.status === 'rejected';
    case 'all':
      return true;
  }
}

export type RuleCounts = Readonly<Record<RuleFilter, number>>;

export function countRules(rules: readonly Rule[]): RuleCounts {
  return {
    todo: rules.filter((rule) => matches(rule, 'todo')).length,
    accepted: rules.filter((rule) => matches(rule, 'accepted')).length,
    rejected: rules.filter((rule) => matches(rule, 'rejected')).length,
    all: rules.length,
  };
}

export interface RuleGroup {
  readonly name: string;
  readonly rules: readonly Rule[];
}

/** Groups in alphabetical order; in a group, the surest rule first. */
export function groupRules(rules: readonly Rule[]): RuleGroup[] {
  const groups = new Map<string, Rule[]>();
  for (const rule of rules) groups.set(rule.group, [...(groups.get(rule.group) ?? []), rule]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([name, list]) => ({ name, rules: [...list].sort((a, b) => b.confidence - a.confidence) }));
}

/** Rules sure enough to accept in one gesture: proposed, and at 90 % confidence or more. */
export const SURE = 0.9;

export function sureProposals(rules: readonly Rule[]): Rule[] {
  return rules.filter((rule) => rule.status === 'proposed' && rule.confidence >= SURE);
}

/** "96 %": confidence as people read it. */
export function percent(confidence: number): string {
  return `${String(Math.round(confidence * 100))} %`;
}
