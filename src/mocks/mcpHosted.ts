// SPDX-License-Identifier: Apache-2.0
import { handleListMcpHostedProcesses, handleRestartMcpHostedProcess } from '@gen/api/msw.gen';
import type { McpHostedProcess, Organization } from '@gen/api/types.gen';
import { zMcpHostedRestart } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { FRESH_SIGN_IN_MS, readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** The MCP host's processes, and when the person last signed in (a restart needs a sign-in of under five minutes). */
export interface McpHostedState extends OrgsState {
  mcpHosted: McpHostedProcess[];
  signedInAt: number;
}

/** `GET /mcp/hosted` and `POST /mcp/hosted/restart`, as the server answers an administrator. */
export function createMcpHostedHandlers(
  state: () => McpHostedState,
  organizationOf: (request: Request) => Organization,
  now: () => Date,
): HttpHandler[] {
  const manages = (organization: Organization): boolean =>
    managesMembers(
      orgRoleOf(state().orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role),
    );
  return [
    handleListMcpHostedProcesses(({ request }) => {
      const organization = organizationOf(request);
      if (!manages(organization))
        return refusal(403, 'forbidden', 'Only an owner or an admin reads the host.');
      return HttpResponse.json({
        hostReachable: true,
        hostVersion: '1.0.0',
        items: organization.id === state().organization.id ? state().mcpHosted : [],
      });
    }),
    handleRestartMcpHostedProcess(async ({ request }) => {
      const organization = organizationOf(request);
      if (!manages(organization))
        return refusal(403, 'forbidden', 'Only an owner or an admin restarts a hosted process.');
      const body = zMcpHostedRestart.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A server name is needed.');
      if (now().getTime() - state().signedInAt > FRESH_SIGN_IN_MS)
        return refusal(
          403,
          'step_up_required',
          'Sign in again to restart: your sign-in is more than five minutes old.',
        );
      const index = state().mcpHosted.findIndex(
        (process) => process.server === body.data.server && process.member === body.data.member,
      );
      if (index === -1) return refusal(404, 'not_found', 'No such hosted process.');
      const process = state().mcpHosted[index];
      if (process === undefined) return refusal(404, 'not_found', 'No such hosted process.');
      // A restart lifts the failure: the process is idle until the next call starts it.
      const lifted: McpHostedProcess = { ...process, state: 'idle' };
      delete lifted.failure;
      state().mcpHosted[index] = lifted;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
