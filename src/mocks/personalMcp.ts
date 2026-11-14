// SPDX-License-Identifier: Apache-2.0
import {
  handleCreateMyMcpServer,
  handleDeleteMyMcpServer,
  handleListMyMcpServers,
  handlePromoteMcpServer,
  handleSaveMyMcpServer,
} from '@gen/api/msw.gen';
import type { McpServer } from '@gen/api/types.gen';
import { zMcpServerWritable } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { readJson, refusal } from './http';

/** The demo person's own MCP servers (`mcp.personal.v1`), relayed to them alone; the team's share their namespace. */
export interface PersonalMcpState {
  myMcpServers: McpServer[];
  mcpServers: McpServer[];
}

export interface PersonalMcpDeps {
  /** The demo person may manage the organization's servers (an owner or an admin). */
  readonly manages: (request: Request) => boolean;
  readonly inDemoOrg: (request: Request) => boolean;
  /** The sign-in is more than five minutes old: a write is refused with `step_up_required`. */
  readonly stale: () => boolean;
  /** The demo person's member id. */
  readonly me: () => string;
}

/** At most 20 personal servers per member. */
const PERSONAL_LIMIT = 20;
const NAME = /^[a-z][a-z0-9-]{0,63}$/;

export function createPersonalMcpHandlers(
  state: () => PersonalMcpState,
  deps: PersonalMcpDeps,
): HttpHandler[] {
  const check = async (
    request: Request,
  ): Promise<{ readonly server: McpServer } | { readonly refused: ReturnType<typeof refusal> }> => {
    if (deps.stale())
      return {
        refused: refusal(
          403,
          'step_up_required',
          'Sign in again: your sign-in is more than five minutes old.',
        ),
      };
    if (!deps.inDemoOrg(request))
      return { refused: refusal(403, 'forbidden', 'The demo keeps servers for its own organization only.') };
    const body = zMcpServerWritable.safeParse(await readJson(request));
    const url = body.success ? (body.data.url ?? '') : '';
    if (!body.success || !NAME.test(body.data.name) || !url.startsWith('https://'))
      return { refused: refusal(400, 'invalid_request', 'A name and an https URL are needed.') };
    if (body.data.transport === 'stdio')
      return { refused: refusal(403, 'hosted_not_allowed', 'Hosted commands are an administrator’s.') };
    // The server sets the owner and keeps every tool: a value sent is ignored.
    const server: McpServer = {
      name: body.data.name,
      url,
      transport: body.data.transport,
      enabled: body.data.enabled,
      scope: 'per-member',
      secretNames: body.data.secretNames ?? [],
      owner: deps.me(),
    };
    return { server };
  };
  return [
    handleListMyMcpServers(({ request }) =>
      HttpResponse.json({ items: deps.inDemoOrg(request) ? state().myMcpServers : [] }),
    ),
    handleCreateMyMcpServer(async ({ request }) => {
      const checked = await check(request);
      if ('refused' in checked) return checked.refused;
      const db = state();
      const taken = [...db.mcpServers, ...db.myMcpServers].some(
        (server) => server.name === checked.server.name,
      );
      if (taken) return refusal(409, 'already_exists', `an MCP server named ${checked.server.name} exists`);
      if (db.myMcpServers.length >= PERSONAL_LIMIT)
        return refusal(409, 'mcp_server_limit', 'At most 20 personal MCP servers.');
      db.myMcpServers = [...db.myMcpServers, checked.server];
      return HttpResponse.json(checked.server, { status: 201 });
    }),
    handleSaveMyMcpServer(async ({ request, params }) => {
      const checked = await check(request);
      if ('refused' in checked) return checked.refused;
      const db = state();
      if (!db.myMcpServers.some((server) => server.name === params.name))
        return refusal(404, 'not_found', 'MCP server not found');
      if (checked.server.name !== params.name)
        return refusal(400, 'invalid_request', 'A server keeps its name: create another one.');
      db.myMcpServers = db.myMcpServers.map((server) =>
        server.name === params.name ? checked.server : server,
      );
      return HttpResponse.json(checked.server);
    }),
    handleDeleteMyMcpServer(({ request, params }) => {
      if (deps.stale())
        return refusal(403, 'step_up_required', 'Sign in again: your sign-in is more than five minutes old.');
      const db = state();
      if (!deps.inDemoOrg(request) || !db.myMcpServers.some((server) => server.name === params.name))
        return refusal(404, 'not_found', 'MCP server not found');
      db.myMcpServers = db.myMcpServers.filter((server) => server.name !== params.name);
      return new HttpResponse(null, { status: 204 });
    }),
    // A member's own server becomes a team server: its owner is cleared; a team server is answered as it is.
    handlePromoteMcpServer(({ request, params }) => {
      if (!deps.manages(request))
        return refusal(403, 'forbidden', 'only owners and admins manage MCP servers');
      if (deps.stale())
        return refusal(403, 'step_up_required', 'Sign in again: your sign-in is more than five minutes old.');
      if (!deps.inDemoOrg(request)) return refusal(404, 'not_found', 'MCP server not found');
      const db = state();
      const team = db.mcpServers.find((server) => server.name === params.name);
      if (team !== undefined) return HttpResponse.json(team);
      const own = db.myMcpServers.find((server) => server.name === params.name);
      if (own === undefined) return refusal(404, 'not_found', 'MCP server not found');
      const promoted: McpServer = { ...own };
      Reflect.deleteProperty(promoted, 'owner');
      db.myMcpServers = db.myMcpServers.filter((server) => server.name !== params.name);
      db.mcpServers = [...db.mcpServers, promoted];
      return HttpResponse.json(promoted);
    }),
  ];
}
