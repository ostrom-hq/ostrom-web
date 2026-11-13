// SPDX-License-Identifier: Apache-2.0
import {
  handleAssignMcpServer,
  handleCreateMcpArgumentPolicy,
  handleDeleteMcpArgumentPolicy,
  handleGetMcpSettings,
  handleListMcpArgumentPolicies,
  handleListMcpAssignments,
  handlePutMcpSettings,
  handleUnassignMcpServer,
} from '@gen/api/msw.gen';
import type {
  McpArgumentCondition,
  McpArgumentPolicy,
  McpAssignment,
  McpServer,
  Member,
  Organization,
} from '@gen/api/types.gen';
import { zMcpArgumentPolicyRequest, zMcpAssignmentRequest, zMcpSettings } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** Who reaches each relayed server, and the calls it refuses or holds; the relay's prefix of each organization. */
export interface McpAccessState extends OrgsState {
  /** The demo organization's servers; another organization has none. */
  mcpServers: McpServer[];
  members: Member[];
  /** By server name. */
  mcpAssignments: Record<string, McpAssignment[]>;
  /** By server name. */
  mcpPolicies: Record<string, McpArgumentPolicy[]>;
  /** By organization id; `ostrom` when never set. */
  mcpPrefixes: Record<string, string>;
  nextPolicyId: number;
}

const PREFIX = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const TOOL = /^(?:\*|[A-Za-z0-9_.-]{1,128})$/;
const VALUELESS = new Set(['EXISTS', 'ABSENT']);

export function createMcpAccessHandlers(
  state: () => McpAccessState,
  organizationOf: (request: Request) => Organization,
  now: () => Date,
): HttpHandler[] {
  const manages = (organization: Organization): boolean =>
    managesMembers(
      orgRoleOf(state().orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role),
    );
  /** The server named in the path, in the organization the call acts in. */
  const serverOf = (request: Request, name: string): McpServer | undefined =>
    organizationOf(request).id === state().organization.id
      ? state().mcpServers.find((server) => server.name === name)
      : undefined;
  /** As the server: an admin's gesture on a server of the organization, else why not. */
  const guard = (request: Request, name: string): ReturnType<typeof refusal> | undefined => {
    if (!manages(organizationOf(request)))
      return refusal(403, 'forbidden', 'Only an owner or an admin manages who reaches a server.');
    if (serverOf(request, name) === undefined) return refusal(404, 'not_found', 'MCP server not found');
    return undefined;
  };
  return [
    handleGetMcpSettings(({ request }) =>
      HttpResponse.json({ agentPrefix: state().mcpPrefixes[organizationOf(request).id] ?? 'ostrom' }),
    ),
    handlePutMcpSettings(async ({ request }) => {
      const organization = organizationOf(request);
      if (!manages(organization))
        return refusal(403, 'forbidden', 'Only an owner or an admin changes the prefix.');
      const body = zMcpSettings.safeParse(await readJson(request));
      if (!body.success || !PREFIX.test(body.data.agentPrefix))
        return refusal(400, 'invalid_request', 'The prefix is 1 to 32 characters of a-z 0-9 _ -.');
      state().mcpPrefixes[organization.id] = body.data.agentPrefix;
      return HttpResponse.json({ agentPrefix: body.data.agentPrefix });
    }),
    handleListMcpAssignments(({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      return HttpResponse.json({ items: state().mcpAssignments[params.name] ?? [] });
    }),
    handleAssignMcpServer(async ({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      const body = zMcpAssignmentRequest.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'tools or a credential are expected');
      const everyone = params.member === 'all';
      if (!everyone && !state().members.some((member) => member.id === params.member))
        return refusal(404, 'not_found', 'member not found');
      if (everyone && body.data.credentialSecret !== undefined)
        return refusal(400, 'invalid_request', 'A credential is assigned to one member, not to all.');
      const assignment: McpAssignment = { server: params.name, assignedAt: now().toISOString() };
      if (!everyone) assignment.member = params.member;
      if (body.data.tools !== undefined) assignment.tools = body.data.tools;
      if (body.data.credentialSecret !== undefined) assignment.credentialSecret = body.data.credentialSecret;
      const others = (state().mcpAssignments[params.name] ?? []).filter(
        (item) => item.member !== assignment.member,
      );
      state().mcpAssignments[params.name] = [...others, assignment];
      return HttpResponse.json(assignment);
    }),
    handleUnassignMcpServer(({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      const member = params.member === 'all' ? undefined : params.member;
      const before = state().mcpAssignments[params.name] ?? [];
      const after = before.filter((item) => item.member !== member);
      if (after.length === before.length) return refusal(404, 'not_found', 'assignment not found');
      state().mcpAssignments[params.name] = after;
      return new HttpResponse(null, { status: 204 });
    }),
    handleListMcpArgumentPolicies(({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      return HttpResponse.json({ policies: state().mcpPolicies[params.name] ?? [] });
    }),
    handleCreateMcpArgumentPolicy(async ({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      const body = zMcpArgumentPolicyRequest.safeParse(await readJson(request));
      if (!body.success || !TOOL.test(body.data.tool) || body.data.message.trim() === '')
        return refusal(400, 'invalid_request', 'The policy names an invalid tool or says nothing.');
      const conditions = body.data.conditions ?? [];
      if (conditions.some((condition) => !VALUELESS.has(condition.operator) && condition.value === undefined))
        return refusal(400, 'invalid_request', 'This condition needs a value of at most 1024 characters.');
      const s = state();
      const policy: McpArgumentPolicy = {
        id: `pol-${String(s.nextPolicyId)}`,
        tool: body.data.tool,
        conditions: conditions.map((condition) => {
          const kept: McpArgumentCondition = { path: condition.path, operator: condition.operator };
          if (condition.value !== undefined) kept.value = condition.value;
          return kept;
        }),
        effect: body.data.effect,
        message: body.data.message,
        createdAt: now().toISOString(),
      };
      s.nextPolicyId += 1;
      s.mcpPolicies[params.name] = [...(s.mcpPolicies[params.name] ?? []), policy];
      return HttpResponse.json(policy, { status: 201 });
    }),
    handleDeleteMcpArgumentPolicy(({ request, params }) => {
      const refused = guard(request, params.name);
      if (refused !== undefined) return refused;
      const before = state().mcpPolicies[params.name] ?? [];
      const after = before.filter((policy) => policy.id !== params.policyId);
      if (after.length === before.length) return refusal(404, 'not_found', 'policy not found');
      state().mcpPolicies[params.name] = after;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
