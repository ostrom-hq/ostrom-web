// SPDX-License-Identifier: AGPL-3.0-only
import type { GateAction, NewRule, Rule, RuleGate, RuleStrength, UpdateRuleData } from '@gen/api/types.gen';

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

/** What a rule becomes: a note the agents read, a check to pass, or a gate that asks a person for a yes. */
export const RULE_OUTPUTS = ['note', 'check', 'gate'] as const;
export type RuleOutput = (typeof RULE_OUTPUTS)[number];

export function isOutput(value: string): value is RuleOutput {
  return RULE_OUTPUTS.some((output) => output === value);
}

export const RULE_STRENGTHS: readonly RuleStrength[] = ['required', 'recommended'];

export function isStrength(value: string): value is RuleStrength {
  return RULE_STRENGTHS.some((strength) => strength === value);
}

/** A check the gate needs; `attested` refuses a run the workstation only declared. */
export interface CheckDraft {
  /** Where the row stays on screen while it is typed; never sent. */
  readonly key: number;
  readonly check: string;
  readonly attested: boolean;
}

/** A rule as its form holds it: text as typed, lists as typed, the gate's actions by class. */
export interface RuleDraft {
  readonly statement: string;
  readonly group: string;
  readonly why: string;
  /** Repositories, separated by commas or spaces; empty for every repository. */
  readonly scope: string;
  readonly strength: RuleStrength;
  readonly output: string;
  readonly actions: readonly string[];
  /** GitHub logins, separated by commas or spaces. */
  readonly approvers: string;
  readonly reason: string;
  readonly checks: readonly CheckDraft[];
  /** Actions written here because the catalogue does not have them yet: the first gate of an organization. */
  readonly extra: readonly GateAction[];
}

/** The draft of a new rule, or of `rule` as it stands. */
export function draftOf(rule?: Rule): RuleDraft {
  const gate = rule?.gate;
  return {
    statement: rule?.statement ?? '',
    group: rule?.group ?? '',
    why: rule?.why ?? '',
    scope: (rule?.scope ?? []).join(', '),
    strength: rule?.strength ?? 'required',
    output: rule?.output ?? 'note',
    actions: (gate?.actions ?? []).map((action) => action.class),
    approvers: (gate?.approvers ?? []).join(', '),
    reason: gate?.reason ?? '',
    checks: (gate?.checks ?? []).map((check, key) => ({
      key,
      check: check.check,
      attested: check.attested ?? false,
    })),
    extra: [],
  };
}

/** "acme/api, acme/web" or one per line: each value once, in the order typed. */
export function listOf(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((value) => value !== ''))];
}

/** The actions a gate may cover: the catalogue's, then those the rule already gates that the catalogue lost. */
export function gateActions(catalog: readonly GateAction[], rule?: Rule): GateAction[] {
  const known = new Set(catalog.map((action) => action.class));
  return [...catalog, ...(rule?.gate?.actions ?? []).filter((action) => !known.has(action.class))];
}

/** What keeps a draft from being sent, the first one only. */
export type DraftProblem = 'statement' | 'group' | 'actions' | 'approvers' | 'check';

/** `actions` are those the gate may pick from: a picked one that left them counts for nothing. */
export function draftProblem(draft: RuleDraft, actions: readonly GateAction[]): DraftProblem | undefined {
  if (draft.statement.trim() === '') return 'statement';
  if (draft.group.trim() === '') return 'group';
  if (draft.output !== 'gate') return undefined;
  if (!actions.some((action) => draft.actions.includes(action.class))) return 'actions';
  if (listOf(draft.approvers).length === 0) return 'approvers';
  if (draft.checks.some((check) => check.check.trim() === '')) return 'check';
  return undefined;
}

/** The gate a draft puts, with the actions picked from `actions`; none unless the rule is a gate. */
export function gateOf(draft: RuleDraft, actions: readonly GateAction[]): RuleGate | undefined {
  if (draft.output !== 'gate') return undefined;
  const reason = draft.reason.trim();
  return {
    actions: actions.filter((action) => draft.actions.includes(action.class)),
    approvers: listOf(draft.approvers),
    ...(reason === '' ? {} : { reason }),
    ...(draft.checks.length === 0
      ? {}
      : { checks: draft.checks.map((check) => ({ check: check.check.trim(), attested: check.attested })) }),
  };
}

/** A new rule from its draft: accepted at once, as the server does by default. */
export function newRuleOf(draft: RuleDraft, actions: readonly GateAction[]): NewRule {
  const why = draft.why.trim();
  const scope = listOf(draft.scope);
  const gate = gateOf(draft, actions);
  return {
    statement: draft.statement.trim(),
    group: draft.group.trim(),
    output: draft.output,
    strength: draft.strength,
    ...(why === '' ? {} : { why }),
    ...(scope.length === 0 ? {} : { scope }),
    ...(gate === undefined ? {} : { gate }),
  };
}

export type RuleChange = UpdateRuleData['body'];

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** A gate as a person reads it: which actions, who answers, why, which checks; not how the server spelled it. */
function gateKey(gate: RuleGate | undefined): string {
  if (gate === undefined) return '';
  return JSON.stringify([
    gate.actions.map((action) => action.class),
    gate.approvers,
    gate.reason ?? '',
    (gate.checks ?? []).map((check) => [check.check, check.attested ?? false]),
  ]);
}

/** Only what the draft changed in `rule`; a gate taken off is sent as `null`, which removes it. */
export function changeOf(rule: Rule, draft: RuleDraft, actions: readonly GateAction[]): RuleChange {
  const statement = draft.statement.trim();
  const group = draft.group.trim();
  const why = draft.why.trim();
  const scope = listOf(draft.scope);
  const gate = gateOf(draft, actions);
  return {
    ...(statement === rule.statement ? {} : { statement }),
    ...(group === rule.group ? {} : { group }),
    ...(why === (rule.why ?? '') ? {} : { why }),
    ...(sameList(scope, rule.scope ?? []) ? {} : { scope }),
    ...(draft.strength === rule.strength ? {} : { strength: draft.strength }),
    ...(draft.output === rule.output ? {} : { output: draft.output }),
    ...(gateKey(gate) === gateKey(rule.gate) ? {} : { gate: gate ?? null }),
  };
}

/** A new, empty check row, after the others. */
export function addCheck(checks: readonly CheckDraft[]): CheckDraft[] {
  const key = checks.reduce((last, check) => Math.max(last, check.key), -1) + 1;
  return [...checks, { key, check: '', attested: false }];
}

/** "Run a migration" → "run-a-migration": the class of an action written by hand. */
export function actionClass(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** An action written by hand, held on the rule's repositories; undefined while its label says nothing. */
export function customAction(label: string, commands: string, scope: string): GateAction | undefined {
  const cls = actionClass(label);
  if (cls === '') return undefined;
  return { class: cls, label: label.trim(), patterns: listOfCommands(commands), repos: listOf(scope) };
}

/** Commands are separated by commas or lines, never by spaces: `helm upgrade` is one command. */
export function listOfCommands(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]+/)
        .map((value) => value.trim())
        .filter((value) => value !== ''),
    ),
  ];
}

/** Every action the form offers: the catalogue's, the rule's own, then those written here. */
export function offeredActions(
  catalog: readonly GateAction[],
  rule: Rule | undefined,
  draft: RuleDraft,
): GateAction[] {
  const offered = gateActions(catalog, rule);
  const known = new Set(offered.map((action) => action.class));
  return [...offered, ...draft.extra.filter((action) => !known.has(action.class))];
}

/**
 * What saving an editor sends. A proposed rule is accepted as it saves ("Save and accept"): fixed when something
 * changed, as it was otherwise. A decided rule keeps its decision, and nothing changed sends nothing.
 */
export function editOf(rule: Rule, draft: RuleDraft, actions: readonly GateAction[]): RuleChange | undefined {
  const change = changeOf(rule, draft, actions);
  const changed = Object.keys(change).length > 0;
  if (rule.status === 'proposed') return changed ? { ...change, status: 'edited' } : { status: 'accepted' };
  return changed ? change : undefined;
}
