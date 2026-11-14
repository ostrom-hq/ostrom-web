// SPDX-License-Identifier: Apache-2.0
import type { InferenceSettings, OrgMember, ModelPolicy, Secret } from '@gen/api/types.gen';
import { zModelPolicy } from '@gen/api/zod.gen';
import { z } from 'zod/mini';

// The contract's policy, with `default` as the server may send it: left out (or null) until one is set.
const SENT_POLICY = z.extend(zModelPolicy, { default: z.nullish(z.string()) });

/**
 * The policy as the server sends it. A new organization's has no `default` until one is set (the server leaves the
 * field out while the contract requires it): it reads as no default, `""`, rather than as a broken answer.
 */
export async function readModelPolicy(data: unknown): Promise<ModelPolicy> {
  const { allowed, default: model, byMember } = await SENT_POLICY.parseAsync(data);
  return { allowed, default: model ?? '', ...(byMember === undefined ? {} : { byMember }) };
}

/** "claude-opus, gpt-5" or one per line: each value once, in the order typed. */
export function listOf(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((value) => value !== ''))];
}

/**
 * Whether `model` passes a list of allowed models, as the gateway reads it: an entry allows every model it starts,
 * and an empty list allows every model.
 */
export function allows(list: readonly string[], model: string): boolean {
  return list.length === 0 || list.some((entry) => model.startsWith(entry));
}

/** A member whose list replaces the organization's; the member is named by id, as the server keys it. */
export interface MemberModels {
  /** Where the row stays on screen while it is typed; never sent. */
  readonly key: number;
  readonly member: string;
  readonly models: string;
}

export interface PolicyDraft {
  readonly allowed: string;
  readonly defaultModel: string;
  readonly byMember: readonly MemberModels[];
}

export function policyDraftOf(policy: ModelPolicy): PolicyDraft {
  // The contract leaves `default` out until one is set (ostrom-core#48): no default is an empty field.
  const { default: defaultModel = '' } = policy;
  return {
    allowed: policy.allowed.join(', '),
    defaultModel,
    byMember: Object.entries(policy.byMember ?? {}).map(([member, models], key) => ({
      key,
      member,
      models: models.join(', '),
    })),
  };
}

/** A member by their login when the members are known, else by the id the policy keys them by. */
export function memberName(id: string, members: readonly OrgMember[] | undefined): string {
  return members?.find((member) => member.id === id)?.login ?? id;
}

export function addMemberRow(rows: readonly MemberModels[]): MemberModels[] {
  const key = rows.reduce((last, row) => Math.max(last, row.key), -1) + 1;
  return [...rows, { key, member: '', models: '' }];
}

/** A model name or prefix, as the gateway accepts it. */
export const MODEL_NAME = /^[A-Za-z0-9._:/-]{1,200}$/;

/**
 * What keeps a policy from being saved, in the order the form says it: a model the gateway would refuse, no default, a
 * default the list refuses, a member row without its member, a member named twice, a member's list left empty (an
 * empty list allows every model: as a member's own, it would lift the organization's restriction).
 */
export type PolicyProblem = 'format' | 'noDefault' | 'default' | 'member' | 'twice' | 'memberModels';

export function policyProblem(draft: PolicyDraft): PolicyProblem | undefined {
  const model = draft.defaultModel.trim();
  const lists = [listOf(draft.allowed), ...draft.byMember.map((row) => listOf(row.models))];
  if ([...lists.flat(), ...(model === '' ? [] : [model])].some((value) => !MODEL_NAME.test(value)))
    return 'format';
  if (model === '') return 'noDefault';
  if (!allows(listOf(draft.allowed), model)) return 'default';
  const members = draft.byMember.map((row) => row.member.trim());
  if (members.includes('')) return 'member';
  if (new Set(members).size < members.length) return 'twice';
  if (draft.byMember.some((row) => listOf(row.models).length === 0)) return 'memberModels';
  return undefined;
}

/**
 * The members whose own list refuses the default model: a launch of theirs that names no model gets the default, which
 * their list then refuses. Said, not refused: a member who always names a model is fine.
 */
export function defaultRefusedFor(draft: PolicyDraft): string[] {
  const model = draft.defaultModel.trim();
  return draft.byMember
    .filter((row) => {
      const list = listOf(row.models);
      return row.member.trim() !== '' && list.length > 0 && model !== '' && !allows(list, model);
    })
    .map((row) => row.member.trim());
}

/** Who may get a list of their own: a member who runs agents, not an invitation (no account yet). */
export function runsAgents(member: OrgMember): boolean {
  return member.role !== 'invited';
}

/** The policy a draft says, once `policyProblem` finds nothing. */
export function policyOf(draft: PolicyDraft): ModelPolicy {
  return {
    allowed: listOf(draft.allowed),
    default: draft.defaultModel.trim(),
    byMember: Object.fromEntries(draft.byMember.map((row) => [row.member.trim(), listOf(row.models)])),
  };
}

/** The providers' keys, named by the organization secret that holds them, and whether shared accounts serve first. */
export interface ProvidersDraft {
  readonly anthropic: string;
  readonly openai: string;
  readonly openrouter: string;
  readonly shared: boolean;
}

export const PROVIDERS = ['anthropic', 'openai', 'openrouter'] as const;
export type Provider = (typeof PROVIDERS)[number];

export function providersDraftOf(settings: InferenceSettings): ProvidersDraft {
  return {
    anthropic: settings.anthropicKeySecret ?? '',
    openai: settings.openaiKeySecret ?? '',
    openrouter: settings.openrouterKeySecret ?? '',
    shared: settings.useSharedAccounts ?? true,
  };
}

/**
 * The settings a draft says; a key left empty is no key. The settings are written whole: the members' concurrent
 * requests of [read], the settings on screen, are kept as they are.
 */
export function settingsOf(draft: ProvidersDraft, read?: InferenceSettings): InferenceSettings {
  const anthropic = draft.anthropic.trim();
  const openai = draft.openai.trim();
  const openrouter = draft.openrouter.trim();
  return {
    ...(anthropic === '' ? {} : { anthropicKeySecret: anthropic }),
    ...(openai === '' ? {} : { openaiKeySecret: openai }),
    ...(openrouter === '' ? {} : { openrouterKeySecret: openrouter }),
    useSharedAccounts: draft.shared,
    ...(read?.memberConcurrency === undefined ? {} : { memberConcurrency: read.memberConcurrency }),
  };
}

/** The secrets a provider key may name: the organization's, never a member's own. */
export function keySecrets(secrets: readonly Secret[]): string[] {
  return secrets
    .filter((secret) => secret.owner === undefined)
    .map((secret) => secret.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * The agents `ostrom <agent>` launches today (ostrom-cli `Agent`), only offered as the check is typed: any name may be
 * asked, and the server says whether it is valid. The contract has no list of agents to read them from.
 */
export const KNOWN_AGENTS = ['claude', 'codex', 'opencode', 'gemini', 'grok', 'hermes', 'pi'] as const;
