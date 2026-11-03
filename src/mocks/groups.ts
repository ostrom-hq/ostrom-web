// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleAddGroupMember,
  handleCreateGroup,
  handleDeleteGroup,
  handleGetGroup,
  handleListGroups,
  handlePauseGroupMember,
  handleRemoveGroupMember,
  handleUpdateGroup,
} from '@gen/api/msw.gen';
import type { ApiError, Group, Organization, OrgMember, SharedAccount } from '@gen/api/types.gen';
import { zCreateGroupBody, zPauseGroupMemberBody, zUpdateGroupBody } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { readJson, refusal } from './http';
import { DEMO_LOGIN, type OrgsState } from './orgs';

/** A group as the server keeps it: in one organization, with every pause, the ones already over included. */
export interface MockGroup {
  readonly id: string;
  readonly orgId: string;
  name: string;
  /** Logins; a member who left the organization is kept by member id. */
  members: string[];
  accounts: string[];
  pauses: { readonly login: string; readonly until: string }[];
}

export interface GroupsState extends OrgsState {
  sharedAccounts: SharedAccount[];
  groups: MockGroup[];
  /** The next group number; numbers are never reused, even after a deletion. */
  nextGroup: number;
}

// The server's `GroupRules`.
const NAME_MAX = 120;
const MAX_GROUPS = 100;

/** A group id as the server writes them, a UUID: the demo's are numbered. */
export function groupId(number: number): string {
  return `0a1b2c3d-4e5f-4a6b-8c7d-${String(number).padStart(12, '0')}`;
}

export function createGroupsHandlers(
  state: () => GroupsState,
  organizationOf: (request: Request) => Organization,
  now: () => Date,
): HttpHandler[] {
  const membersIn = (organization: Organization): OrgMember[] => state().orgMembers[organization.id] ?? [];
  const roleIn = (organization: Organization) =>
    orgRoleOf(membersIn(organization).find((member) => member.login === DEMO_LOGIN)?.role);
  const loginsIn = (organization: Organization): string[] =>
    membersIn(organization).map((member) => member.login);
  const groupsIn = (organization: Organization): MockGroup[] =>
    state().groups.filter((group) => group.orgId === organization.id);
  const find = (request: Request, id: string): MockGroup | undefined =>
    groupsIn(organizationOf(request)).find((group) => group.id === id);
  const viewOf = (group: MockGroup): Group => ({
    id: group.id,
    name: group.name,
    members: [...group.members],
    accounts: [...group.accounts],
    paused: group.pauses.filter((pause) => Date.parse(pause.until) > now().getTime()),
  });
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'Group not found.');
  const done = (): HttpResponse<null> => new HttpResponse(null, { status: 204 });
  /** A member reads the groups; only an owner or an admin changes them (403). */
  const refusedWrite = (request: Request): HttpResponse<ApiError> | undefined =>
    managesMembers(roleIn(organizationOf(request)))
      ? undefined
      : refusal(403, 'forbidden', 'Only an owner or an admin changes a group.');
  const nameRefusal = (
    name: string,
    organization: Organization,
    except?: string,
  ): HttpResponse<ApiError> | undefined => {
    if (name === '' || name.length > NAME_MAX)
      return refusal(400, 'invalid_request', 'A group’s name has 1 to 120 characters.');
    const taken = groupsIn(organization).some(
      (group) => group.id !== except && group.name.toLowerCase() === name.toLowerCase(),
    );
    return taken ? refusal(409, 'conflict', 'Another group already has this name.') : undefined;
  };
  const accountsRefusal = (accounts: readonly string[]): HttpResponse<ApiError> | undefined =>
    accounts.every((id) => state().sharedAccounts.some((account) => account.id === id))
      ? undefined
      : refusal(400, 'invalid_request', 'No shared account of the organization has this id.');
  return [
    handleListGroups(({ request }) =>
      HttpResponse.json({
        items: groupsIn(organizationOf(request))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(viewOf),
      }),
    ),
    handleCreateGroup(async ({ request }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const body = zCreateGroupBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A group has a name.');
      const organization = organizationOf(request);
      const name = body.data.name.trim();
      const members = body.data.members ?? [];
      const accounts = body.data.accounts ?? [];
      const wrong =
        nameRefusal(name, organization) ??
        (members.every((login) => loginsIn(organization).includes(login))
          ? accountsRefusal(accounts)
          : refusal(400, 'invalid_request', 'No member of the organization has this login.'));
      if (wrong !== undefined) return wrong;
      if (groupsIn(organization).length >= MAX_GROUPS)
        return refusal(409, 'conflict', 'An organization has at most 100 groups.');
      const s = state();
      const group: MockGroup = {
        id: groupId(s.nextGroup),
        orgId: organization.id,
        name,
        members: [...new Set(members)],
        accounts: [...new Set(accounts)],
        pauses: [],
      };
      s.nextGroup += 1;
      s.groups.push(group);
      return HttpResponse.json(viewOf(group), { status: 201 });
    }),
    handleGetGroup(({ request, params }) => {
      const group = find(request, params.id);
      return group === undefined ? notFound() : HttpResponse.json(viewOf(group));
    }),
    handleUpdateGroup(async ({ request, params }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const group = find(request, params.id);
      if (group === undefined) return notFound();
      const body = zUpdateGroupBody.safeParse(await readJson(request));
      if (!body.success) return refusal(400, 'invalid_request', 'A name or the accounts lent.');
      const name = body.data.name?.trim();
      const { accounts } = body.data;
      const wrong =
        (name === undefined ? undefined : nameRefusal(name, organizationOf(request), group.id)) ??
        (accounts === undefined ? undefined : accountsRefusal(accounts));
      if (wrong !== undefined) return wrong;
      if (name !== undefined) group.name = name;
      if (accounts !== undefined) group.accounts = [...new Set(accounts)];
      return HttpResponse.json(viewOf(group));
    }),
    handleDeleteGroup(({ request, params }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const group = find(request, params.id);
      if (group === undefined) return notFound();
      const s = state();
      s.groups = s.groups.filter((item) => item !== group);
      return done();
    }),
    handleAddGroupMember(({ request, params }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const group = find(request, params.id);
      if (group === undefined) return notFound();
      if (!loginsIn(organizationOf(request)).includes(params.login))
        return refusal(404, 'not_found', 'No member of the organization has this login.');
      // Already in: nothing changes, a pause included.
      if (!group.members.includes(params.login)) group.members.push(params.login);
      return done();
    }),
    handleRemoveGroupMember(({ request, params }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const group = find(request, params.id);
      if (group === undefined) return notFound();
      if (!group.members.includes(params.login))
        return refusal(404, 'not_found', 'This person is not in the group.');
      group.members = group.members.filter((login) => login !== params.login);
      group.pauses = group.pauses.filter((pause) => pause.login !== params.login);
      return done();
    }),
    handlePauseGroupMember(async ({ request, params }) => {
      const refused = refusedWrite(request);
      if (refused !== undefined) return refused;
      const group = find(request, params.id);
      if (group === undefined) return notFound();
      const body = zPauseGroupMemberBody.safeParse(await readJson(request));
      const until = body.success ? body.data.until : undefined;
      if (until === undefined || Number.isNaN(Date.parse(until)))
        return refusal(400, 'invalid_request', '`until` is an ISO 8601 instant.');
      if (!group.members.includes(params.login))
        return refusal(404, 'not_found', 'This person is not in the group.');
      // An instant already past ends the pause.
      group.pauses = [
        ...group.pauses.filter((pause) => pause.login !== params.login),
        { login: params.login, until: new Date(Date.parse(until)).toISOString() },
      ];
      return done();
    }),
  ];
}
