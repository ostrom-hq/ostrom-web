// SPDX-License-Identifier: AGPL-3.0-only
import {
  handleAcceptInvitation,
  handleCreateInvitationLink,
  handleCreateOrg,
  handleGetOrg,
  handleInviteOrgMembers,
  handleListInvitations,
  handleListMyOrganizations,
  handleListOrgMembers,
  handleListOrgs,
  handlePreviewInvitation,
  handleRemoveOrgMember,
  handleRenameOrg,
  handleRevokeInvitation,
  handleUpdateOrgMember,
} from '@gen/api/msw.gen';
import type { ApiError, Invitation, Organization, OrgMember, OrgView } from '@gen/api/types.gen';
import {
  zInvitationLinkCreate,
  zInvitationToken,
  zOrgCreate,
  zOrgInvites,
  zOrgMemberUpdate,
  zOrgRename,
} from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { nameProblem, slugOf, slugProblem } from '@/shared/org/slug';
import { givableRoles, managesMembers, mayManage, type OrgRole, orgRoleOf } from '@/shared/org/roles';

/** The demo person, as `/orgs/{org}/members` lists them. */
export const DEMO_LOGIN = 'maya';
export const DEMO_EMAIL = 'maya@acme.dev';

/** An invitation as the server keeps it: with the organization it leads to and its link's secret. */
export interface MockInvitation extends Invitation {
  readonly orgId: string;
  readonly token: string;
}

export interface OrgsState {
  /** The demo's own organization: every other slice of the mock reads its data. */
  organization: Organization;
  /** The person's other memberships. */
  otherOrganizations: Organization[];
  /** A fresh account: a member of no organization until they create one or accept an invitation. */
  noOrganization: boolean;
  /** The members of each organization by id, as `/orgs/{org}/members` serves them. */
  orgMembers: Record<string, OrgMember[]>;
  /** The short name of each organization by id. */
  slugs: Record<string, string>;
  /** Live invitations of every organization, the ones that lead elsewhere included. */
  invitations: MockInvitation[];
  /** Organizations the person is not in yet, that an invitation leads to. */
  elsewhere: Organization[];
  /** The next invitation number; numbers are never reused. */
  nextInvitation: number;
  /** Whether the GitHub App is installed, by organization id: a new organization has it not. */
  githubInstalled: Record<string, boolean>;
}

/** The person's organizations: the demo's own first; none for a fresh account. */
export function membershipsOf(state: OrgsState): Organization[] {
  return state.noOrganization ? [] : [state.organization, ...state.otherOrganizations];
}

function refusal(status: number, type: string, message: string): HttpResponse<ApiError> {
  return HttpResponse.json<ApiError>({ error: { type, message } }, { status });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const MAX_SLUG = 39;
const SLUG_ATTEMPTS = 20;

function suffixed(base: string, suffix: string): string {
  return base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '') + suffix;
}

/** The server's numbering of a derived short name that is taken. */
export function freeSlug(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  for (let n = 2; n <= SLUG_ATTEMPTS; n += 1) {
    const numbered = suffixed(base, `-${String(n)}`);
    if (!used.has(numbered)) return numbered;
  }
  return suffixed(base, `-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`);
}

/** The person as the owner of an organization they made. */
function owner(at: string): OrgMember {
  return {
    login: DEMO_LOGIN,
    name: 'Maya Lind',
    avatarUrl: '',
    email: DEMO_EMAIL,
    role: 'owner',
    joinedAt: at,
  };
}

/** The members of an organization; one the demo knows nothing about is the person's own, and is kept so. */
function membersIn(state: OrgsState, organization: Organization, now: () => Date): OrgMember[] {
  const known = state.orgMembers[organization.id];
  if (known !== undefined) return known;
  const created = [owner(organization.createdAt ?? now().toISOString())];
  state.orgMembers[organization.id] = created;
  return created;
}

/** The demo person's role in an organization, as every mock that checks a role reads it; none if not listed. */
export function demoRoleIn(
  state: OrgsState,
  organization: Organization,
  now: () => Date,
): OrgRole | undefined {
  return orgRoleOf(membersIn(state, organization, now).find((member) => member.login === DEMO_LOGIN)?.role);
}

export function createOrgsHandlers(state: () => OrgsState, now: () => Date): HttpHandler[] {
  const shortNameOf = (organization: Organization): string =>
    state().slugs[organization.id] ?? slugOf(organization.name);
  const membersOf = (organization: Organization): OrgMember[] => membersIn(state(), organization, now);
  const roleIn = (organization: Organization): OrgRole | undefined => demoRoleIn(state(), organization, now);
  // A person the demo lists in no role reads as a member.
  const roleOf = (organization: Organization): OrgRole => roleIn(organization) ?? 'member';
  const view = (organization: Organization): OrgView => ({
    id: organization.id,
    slug: shortNameOf(organization),
    name: organization.name,
    role: roleOf(organization),
    createdAt: organization.createdAt ?? now().toISOString(),
  });
  /** `{org}` is an id or a short name; an organization the person is not in is not found. */
  const find = (key: string): Organization | undefined =>
    membershipsOf(state()).find(
      (organization) => organization.id === key || shortNameOf(organization) === key,
    );
  const notFound = (): HttpResponse<ApiError> => refusal(404, 'not_found', 'organization not found');
  const liveInvitation = (token: string): MockInvitation | undefined =>
    state().invitations.find(
      (invitation) =>
        invitation.token === token &&
        Date.parse(invitation.expiresAt) > now().getTime() &&
        (invitation.maxUses === null || invitation.uses < invitation.maxUses),
    );
  const issue = (
    orgId: string,
    email: string | null,
    role: OrgRole,
    maxUses: number | null,
  ): MockInvitation => {
    const s = state();
    const number = s.nextInvitation;
    s.nextInvitation += 1;
    const created = now();
    const invitation: MockInvitation = {
      id: `inv-${String(number)}`,
      orgId,
      token: `inv_${String(number)}`,
      email,
      role,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + 7 * 86_400_000).toISOString(),
      maxUses,
      uses: 0,
    };
    s.invitations = [invitation, ...s.invitations];
    return invitation;
  };
  /** What the server lists of an invitation: never its organization nor its secret. */
  const listed = (invitation: MockInvitation): Invitation => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    maxUses: invitation.maxUses,
    uses: invitation.uses,
  });
  return [
    // The person's organizations, with what the console needs before it names one: short name and role.
    handleListMyOrganizations(() =>
      HttpResponse.json({
        items: membershipsOf(state()).map((organization) => ({
          id: organization.id,
          slug: shortNameOf(organization),
          name: organization.name,
          avatarUrl: organization.avatarUrl,
          role: roleOf(organization),
        })),
      }),
    ),
    handleListOrgs(() => HttpResponse.json({ items: membershipsOf(state()).map(view) })),
    handleCreateOrg(async ({ request }) => {
      const body = zOrgCreate.safeParse(await readJson(request));
      const name = body.success ? body.data.name.trim() : '';
      if (!body.success || nameProblem(name) !== undefined)
        return refusal(
          400,
          'invalid_request',
          'The name must be 1 to 100 characters, without control characters.',
        );
      const s = state();
      /** Short names in use, those of organizations the person is not in included; `acme-corp` stands for a stranger's. */
      const used = new Set(['acme-corp', ...[...membershipsOf(s), ...s.elsewhere].map(shortNameOf)]);
      const chosen = body.data.slug;
      if (chosen !== undefined) {
        if (slugProblem(chosen) !== undefined)
          return refusal(
            400,
            'invalid_request',
            'The short name must be 2 to 39 lower case letters, digits and single dashes.',
          );
        if (used.has(chosen)) return refusal(409, 'slug_taken', 'This short name is taken.');
      }
      // Without a choice, the server takes the derived short name, or the first of `name-2` to `name-20` that is free,
      // else a random suffix; cut to stay within 39 characters (`freeSlug` in the server's `Rules.kt`).
      const slug = chosen ?? freeSlug(slugOf(name), used);
      const at = now().toISOString();
      const created: Organization = {
        id: `org-${slug}`,
        name,
        avatarUrl: '',
        connectedVia: 'github-app',
        createdAt: at,
      };
      s.slugs[created.id] = slug;
      s.orgMembers[created.id] = [owner(at)];
      s.githubInstalled[created.id] = false;
      if (s.noOrganization) {
        s.organization = created;
        s.noOrganization = false;
      } else s.otherOrganizations = [...s.otherOrganizations, created];
      return HttpResponse.json(view(created), { status: 201 });
    }),
    handleGetOrg(({ params }) => {
      const organization = find(params.org);
      return organization === undefined ? notFound() : HttpResponse.json(view(organization));
    }),
    handleRenameOrg(async ({ params, request }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      if (!managesMembers(roleIn(organization)))
        return refusal(403, 'forbidden', 'only an owner or an admin renames the organization');
      const body = zOrgRename.safeParse(await readJson(request));
      const name = body.success ? body.data.name.trim() : '';
      if (name === '' || name.length > 100) return refusal(400, 'invalid_request', 'a name is needed');
      organization.name = name;
      return HttpResponse.json(view(organization));
    }),
    handleListOrgMembers(({ params }) => {
      const organization = find(params.org);
      return organization === undefined ? notFound() : HttpResponse.json({ items: membersOf(organization) });
    }),
    handleUpdateOrgMember(async ({ params, request }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      const members = membersOf(organization);
      const index = members.findIndex((member) => member.login === params.login);
      const target = members[index];
      if (target === undefined) return refusal(404, 'not_found', 'member not found');
      const body = zOrgMemberUpdate.safeParse(await readJson(request));
      const role = orgRoleOf(body.success ? body.data.role : undefined);
      if (role === undefined) return refusal(400, 'invalid_request', 'unknown role');
      const caller = roleIn(organization);
      const targetRole = orgRoleOf(target.role);
      if (
        target.login === DEMO_LOGIN ||
        targetRole === undefined ||
        !mayManage(caller, targetRole) ||
        !givableRoles(caller).includes(role)
      )
        return refusal(403, 'not_allowed', 'Your role does not allow this change.');
      const updated: OrgMember = { ...target, role };
      members[index] = updated;
      return HttpResponse.json(updated);
    }),
    handleRemoveOrgMember(({ params }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      const members = membersOf(organization);
      const target = members.find((member) => member.login === params.login);
      if (target === undefined) return refusal(404, 'not_found', 'member not found');
      const targetRole = orgRoleOf(target.role);
      if (targetRole === undefined || !mayManage(roleIn(organization), targetRole))
        return refusal(403, 'not_allowed', 'Your role does not allow removing this person.');
      state().orgMembers[organization.id] = members.filter((member) => member !== target);
      return new HttpResponse(null, { status: 204 });
    }),
    handleInviteOrgMembers(async ({ params, request }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      const caller = roleIn(organization);
      if (!managesMembers(caller))
        return refusal(403, 'not_allowed', 'Only an owner or an admin can invite people.');
      const body = zOrgInvites.safeParse(await readJson(request));
      if (!body.success || body.data.invites.length === 0)
        return refusal(400, 'invalid_request', 'at least one address is needed');
      const present = new Set(membersOf(organization).map((member) => member.email?.toLowerCase()));
      const invited: string[] = [];
      for (const { email, role } of body.data.invites) {
        const given = orgRoleOf(role ?? 'member');
        if (given === undefined || !givableRoles(caller).includes(given))
          return refusal(403, 'not_allowed', `Your role does not allow inviting someone as ${String(role)}.`);
        const address = email.toLowerCase();
        if (present.has(address) || invited.includes(address)) continue;
        issue(organization.id, address, given, 1);
        invited.push(address);
      }
      return HttpResponse.json({ invited });
    }),
    handleListInvitations(({ params }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      if (!managesMembers(roleIn(organization)))
        return refusal(403, 'not_allowed', 'Only an owner or an admin can see the invitations.');
      return HttpResponse.json({
        items: state()
          .invitations.filter((invitation) => invitation.orgId === organization.id)
          .map(listed),
      });
    }),
    handleCreateInvitationLink(async ({ params, request }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      const caller = roleIn(organization);
      if (!managesMembers(caller))
        return refusal(403, 'not_allowed', 'Only an owner or an admin can invite people.');
      const body = zInvitationLinkCreate.safeParse(await readJson(request));
      const role = orgRoleOf(body.success ? (body.data.role ?? 'member') : undefined);
      const maxUses = body.success ? (body.data.maxUses ?? 10) : 0;
      if (role === undefined || maxUses < 1 || maxUses > 100)
        return refusal(400, 'invalid_request', 'a role and 1 to 100 uses');
      if (!givableRoles(caller).includes(role))
        return refusal(403, 'not_allowed', `Your role does not allow inviting someone as ${role}.`);
      const invitation = issue(organization.id, null, role, maxUses);
      const url = `${new URL(request.url).origin}/invite#token=${invitation.token}`;
      return HttpResponse.json({ invitation: listed(invitation), url }, { status: 201 });
    }),
    handleRevokeInvitation(({ params }) => {
      const organization = find(params.org);
      if (organization === undefined) return notFound();
      if (!managesMembers(roleIn(organization)))
        return refusal(403, 'not_allowed', 'Only an owner or an admin can revoke an invitation.');
      const s = state();
      const found = s.invitations.some(
        (invitation) => invitation.id === params.id && invitation.orgId === organization.id,
      );
      if (!found) return refusal(404, 'not_found', 'invitation not found');
      s.invitations = s.invitations.filter((invitation) => invitation.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    handlePreviewInvitation(async ({ request }) => {
      const body = zInvitationToken.safeParse(await readJson(request));
      const invitation = body.success ? liveInvitation(body.data.token) : undefined;
      const s = state();
      const organization = [...membershipsOf(s), ...s.elsewhere].find(
        (item) => item.id === invitation?.orgId,
      );
      if (invitation === undefined || organization === undefined)
        return refusal(404, 'not_found', 'This invitation no longer works.');
      return HttpResponse.json({
        orgName: organization.name,
        orgSlug: shortNameOf(organization),
        role: invitation.role,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      });
    }),
    handleAcceptInvitation(async ({ request }) => {
      const body = zInvitationToken.safeParse(await readJson(request));
      const invitation = body.success ? liveInvitation(body.data.token) : undefined;
      const s = state();
      const organization = s.elsewhere.find((item) => item.id === invitation?.orgId);
      if (invitation === undefined) return refusal(404, 'not_found', 'This invitation no longer works.');
      if (invitation.email !== null && invitation.email !== DEMO_EMAIL)
        return refusal(404, 'not_found', 'This invitation is for another address.');
      if (organization === undefined)
        return refusal(409, 'already_member', 'You are already a member of this organization.');
      const at = now().toISOString();
      s.orgMembers[organization.id] = [
        ...(s.orgMembers[organization.id] ?? []),
        { ...owner(at), role: invitation.role },
      ];
      s.invitations = s.invitations.map((item) =>
        item.id === invitation.id ? { ...item, uses: item.uses + 1 } : item,
      );
      s.elsewhere = s.elsewhere.filter((item) => item !== organization);
      if (s.noOrganization) {
        s.organization = organization;
        s.noOrganization = false;
      } else s.otherOrganizations = [...s.otherOrganizations, organization];
      return HttpResponse.json(view(organization));
    }),
  ];
}

/** Gives the demo person another role in the demo's organization: what a screen shows to each role is tested so. */
export function setDemoRole(state: OrgsState, role: OrgRole): void {
  state.orgMembers[state.organization.id] = (state.orgMembers[state.organization.id] ?? []).map((member) =>
    member.login === DEMO_LOGIN ? { ...member, role } : member,
  );
}
