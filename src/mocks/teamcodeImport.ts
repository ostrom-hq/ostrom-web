// SPDX-License-Identifier: Apache-2.0
import { handleImportTeamCode } from '@gen/api/msw.gen';
import type { ImportItem, ImportReport, Organization } from '@gen/api/types.gen';
import { zImportTeamCodeBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

export interface TeamCodeImportState extends OrgsState {
  /** What each organization imported already, as `kind:name`: a second run reports it unchanged. */
  imported: Record<string, string[]>;
  /** Whether the server has an audit log and shared accounts: without them, the cutover answers 503. */
  cutoverAvailable: boolean;
}

function reportOf(items: ImportItem[]): ImportReport {
  const count = (action: ImportItem['action']): number =>
    items.filter((item) => item.action === action).length;
  return {
    items,
    created: count('created'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    skipped: count('skipped'),
    reviveAtCutover: count('revive_at_cutover'),
  };
}

/**
 * `POST /import/teamcode` as the server runs it: owners and admins import, owners alone cut over; the plan writes
 * nothing; a second run reports what it wrote unchanged; an expired shared account waits for the cutover.
 */
export function createTeamCodeImportHandlers(
  state: () => TeamCodeImportState,
  organizationOf: (request: Request) => Organization,
  now: () => Date,
): HttpHandler[] {
  return [
    handleImportTeamCode(async ({ request }) => {
      const organization = organizationOf(request);
      const s = state();
      const role = orgRoleOf(
        s.orgMembers[organization.id]?.find((member) => member.login === DEMO_LOGIN)?.role,
      );
      const query = new URL(request.url).searchParams;
      const dryRun = query.get('dryRun') === 'true';
      const cutover = query.get('cutover') === 'true';
      if (!managesMembers(role)) return refusal(403, 'forbidden', 'Only an owner or an admin imports.');
      // The server's own refusals, word for word: the console recognises them as written before anything.
      if (cutover && role !== 'owner')
        return refusal(403, 'forbidden', 'Only an owner of the organization runs the cutover import.');
      if (cutover && !s.cutoverAvailable)
        return refusal(
          503,
          'unavailable',
          'This server keeps no audit log, so it cannot record a cutover import.',
        );
      const body = zImportTeamCodeBody.safeParse(await readJson(request));
      if (!body.success)
        return refusal(400, 'invalid_request', 'This is not what `ostrom import teamcode` sends.');
      const done = new Set(s.imported[organization.id] ?? []);
      const items: ImportItem[] = [];
      const write = (kind: ImportItem['kind'], name: string): void => {
        const key = `${kind}:${name}`;
        if (done.has(key)) items.push({ kind, name, action: 'unchanged' });
        else if (dryRun) items.push({ kind, name, action: 'planned' });
        else {
          done.add(key);
          items.push({ kind, name, action: 'created' });
        }
      };
      const servers = body.data.mcpServers ?? [];
      const map = body.data.memberMap ?? {};
      for (const server of servers) write('server', server.target);
      for (const assignment of body.data.assignments ?? []) {
        const server = servers.find((item) => item.id === assignment.serverId);
        const member = body.data.members?.find((item) => item.id === assignment.memberId);
        const username = member?.username ?? assignment.memberId;
        if (server === undefined)
          items.push({
            kind: 'assignment',
            name: username,
            action: 'skipped',
            reason: 'Unknown TeamCode server.',
          });
        else if (map[assignment.memberId] === undefined)
          items.push({
            kind: 'assignment',
            name: `${server.target}/${username}`,
            action: 'skipped',
            reason: `${username} has no Ostrom member.`,
          });
        else write('assignment', `${server.target}/${username}`);
      }
      for (const account of body.data.accounts ?? []) {
        const expired = Date.parse(account.expiresAt) <= now().getTime();
        if (!expired) write('account', account.label);
        else if (cutover) items.push({ kind: 'account', name: account.label, action: 'updated' });
        else
          items.push({
            kind: 'account',
            name: account.label,
            action: 'revive_at_cutover',
            reason: 'Waits for a reconnection until the cutover run.',
          });
      }
      if (!dryRun) s.imported[organization.id] = [...done];
      return HttpResponse.json(reportOf(items));
    }),
  ];
}
