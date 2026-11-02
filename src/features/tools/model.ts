// SPDX-License-Identifier: AGPL-3.0-only
import type {
  McpArgumentCondition,
  McpArgumentPolicy,
  McpArgumentPolicyRequest,
  McpAssignment,
  McpAssignmentRequest,
  McpServer,
  Member,
  Secret,
} from '@gen/api/types.gen';

/** The name an agent calls the server by: lowercase, digits and dashes, as the server routes it. */
export const MCP_SERVER_NAME = /^[a-z][a-z0-9-]{0,39}$/;
/** A secret is an environment variable in the agent's sandbox. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
export const TRANSPORTS = ['http', 'sse'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export function isTransport(value: string): value is Transport {
  return TRANSPORTS.some((transport) => transport === value);
}

/** The relay only reaches servers over TLS. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Splits "A, B  C" into names, without blanks or repeats. */
export function parseNames(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((name) => name !== ''))];
}

export interface ServerDraft {
  readonly name: string;
  readonly url: string;
  readonly transport: Transport;
  readonly secrets: string;
}

export type ServerDraftProblem = 'name' | 'url' | 'secret';

/** What stops the server from being added, in the order the form reads, or the server to send. */
export function checkServer(
  draft: ServerDraft,
): { readonly problem: ServerDraftProblem; readonly detail?: string } | { readonly server: McpServer } {
  const name = draft.name.trim();
  if (!MCP_SERVER_NAME.test(name)) return { problem: 'name' };
  const url = draft.url.trim();
  if (!isHttpsUrl(url)) return { problem: 'url' };
  const secretNames = parseNames(draft.secrets);
  const wrong = secretNames.find((secret) => !SECRET_NAME.test(secret));
  if (wrong !== undefined) return { problem: 'secret', detail: wrong };
  // `shared`: one credential for everyone, the org secrets above; the server takes `shared` or `per-member` only.
  return { server: { name, url, transport: draft.transport, secretNames, enabled: true, scope: 'shared' } };
}

/** The secrets a server needs that the organization does not have: its calls fail until they exist. */
export function missingSecrets(server: McpServer, secrets: readonly Secret[]): string[] {
  return (server.secretNames ?? []).filter((name) => !secrets.some((secret) => secret.name === name));
}

/** The prefix agents see before each relayed server: 1 to 32 of a-z 0-9 _ -, starting with a letter or digit. */
export const AGENT_PREFIX = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** What an agent calls a relayed server's tool: `mcp__<prefix>-<server>__<tool>`, dots turned to underscores. */
export function agentToolName(prefix: string, server: string): string {
  return `mcp__${prefix}-${server.replaceAll('.', '_')}__<tool>`;
}

/** A tool as the relay names it, or `*` for every tool of the server. */
const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;
export const ANY_TOOL = '*';

export function isToolName(value: string): boolean {
  return TOOL_NAME.test(value);
}

export const CONDITION_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'MATCHES',
  'PREFIX',
  'CONTAINS',
  'EXISTS',
  'ABSENT',
] as const satisfies readonly McpArgumentCondition['operator'][];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export function isConditionOperator(value: string): value is ConditionOperator {
  return CONDITION_OPERATORS.some((operator) => operator === value);
}

/** Operators that test whether the argument is there, with no operand. */
export function takesValue(operator: ConditionOperator): boolean {
  return operator !== 'EXISTS' && operator !== 'ABSENT';
}

export const POLICY_EFFECTS = [
  'DENY',
  'REQUIRE_APPROVAL',
] as const satisfies readonly McpArgumentPolicy['effect'][];
export type PolicyEffect = (typeof POLICY_EFFECTS)[number];

export function isPolicyEffect(value: string): value is PolicyEffect {
  return POLICY_EFFECTS.some((effect) => effect === value);
}

export interface ConditionDraft {
  readonly path: string;
  readonly operator: ConditionOperator;
  readonly value: string;
}

export interface PolicyDraft {
  readonly tool: string;
  readonly effect: PolicyEffect;
  readonly message: string;
  readonly conditions: readonly ConditionDraft[];
}

export type PolicyDraftProblem = 'tool' | 'message' | 'path' | 'value';

/** The relay's limits (`McpRules`): the message the agent is told, an argument path, a compared value. */
const MAX_MESSAGE = 500;
const MAX_PATH = 256;
const MAX_VALUE = 1024;

/** What stops the policy from being sent, in the order the form reads, or the request to send. */
export function checkPolicy(
  draft: PolicyDraft,
): { readonly problem: PolicyDraftProblem } | { readonly request: McpArgumentPolicyRequest } {
  const tool = draft.tool.trim();
  if (tool !== ANY_TOOL && !isToolName(tool)) return { problem: 'tool' };
  const message = draft.message.trim();
  if (message === '' || message.length > MAX_MESSAGE) return { problem: 'message' };
  const conditions: McpArgumentCondition[] = [];
  for (const condition of draft.conditions) {
    const path = condition.path.trim();
    if (path === '' || path.length > MAX_PATH) return { problem: 'path' };
    if (!takesValue(condition.operator)) {
      conditions.push({ path, operator: condition.operator });
      continue;
    }
    // The relay takes an empty value, but here it is a field left blank far more often than `equals ""`.
    if (condition.value === '' || condition.value.length > MAX_VALUE) return { problem: 'value' };
    conditions.push({ path, operator: condition.operator, value: condition.value });
  }
  return { request: { tool, effect: draft.effect, message, conditions } };
}

/** `all`: every member of the organization, the path's word for it. */
export const EVERYONE = 'all';

export interface AssignmentDraft {
  /** A member id, or `all`. */
  readonly member: string;
  /** Every tool, or only the listed ones. */
  readonly onlySome: boolean;
  readonly tools: string;
  readonly credentialSecret: string;
}

export type AssignmentDraftProblem = 'member' | 'noTool' | 'tool' | 'credential' | 'credentialEveryone';

/** What stops the assignment from being sent, or the member and the request to send. */
export function checkAssignment(
  draft: AssignmentDraft,
):
  | { readonly problem: AssignmentDraftProblem; readonly detail?: string }
  | { readonly member: string; readonly request: McpAssignmentRequest } {
  const member = draft.member.trim();
  if (member === '') return { problem: 'member' };
  const request: McpAssignmentRequest = {};
  if (draft.onlySome) {
    // An empty allowlist allows no call: the relay takes it, but here it is a list left blank, not a choice.
    const tools = parseNames(draft.tools);
    if (tools.length === 0) return { problem: 'noTool' };
    const wrong = tools.find((tool) => !isToolName(tool));
    if (wrong !== undefined) return { problem: 'tool', detail: wrong };
    request.tools = tools;
  }
  const credential = draft.credentialSecret.trim();
  if (credential !== '') {
    // A personal credential belongs to one member: the server refuses it with `all`.
    if (member === EVERYONE) return { problem: 'credentialEveryone' };
    if (!SECRET_NAME.test(credential)) return { problem: 'credential' };
    request.credentialSecret = credential;
  }
  return { member, request };
}

/** Everyone first, then members as listed. */
export function sortAssignments(assignments: readonly McpAssignment[]): McpAssignment[] {
  return [...assignments].sort((a, b) => Number(a.member !== undefined) - Number(b.member !== undefined));
}

/** "Maya Lind (maya)", or the login alone. */
export function memberLabel(member: Member): string {
  return member.name === undefined || member.name === '' ? member.login : `${member.name} (${member.login})`;
}
