// SPDX-License-Identifier: AGPL-3.0-only
import { handleDeleteOrg } from '@gen/api/msw.gen';
import type { ApiError, Organization } from '@gen/api/types.gen';
import { zOrgDeleteConfirm } from '@gen/api/zod.gen';
import { type HttpHandler, HttpResponse } from 'msw';
import { DEMO_LOGIN, membershipsOf, type OrgsState, slugify } from '@/mocks/orgs';

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

/** Takes the organization out of the person's memberships; another one becomes the demo's own, or none is left. */
function remove(s: OrgsState, organization: Organization): void {
  if (s.organization === organization) {
    const [next, ...rest] = s.otherOrganizations;
    if (next === undefined) s.noOrganization = true;
    else {
      s.organization = next;
      s.otherOrganizations = rest;
    }
  } else s.otherOrganizations = s.otherOrganizations.filter((item) => item !== organization);
  s.orgMembers = Object.fromEntries(Object.entries(s.orgMembers).filter(([id]) => id !== organization.id));
  s.invitations = s.invitations.filter((invitation) => invitation.orgId !== organization.id);
}

/**
 * `DELETE /orgs/{org}` as ostrom-server's `DeleteOrgUseCase`: the owner only, who types the short name again. A
 * member of no such organization finds none.
 */
export function createOrgDeletionHandlers(state: () => OrgsState): HttpHandler[] {
  return [
    handleDeleteOrg(async ({ params, request }) => {
      const s = state();
      const slugOf = (organization: Organization): string =>
        s.slugs[organization.id] ?? slugify(organization.name);
      const organization = membershipsOf(s).find(
        (item) => item.id === params.org || slugOf(item) === params.org,
      );
      if (organization === undefined) return refusal(404, 'not_found', 'organization not found');
      // An organization the demo knows no members of is the person's own, as in `mocks/orgs.ts`.
      const members = s.orgMembers[organization.id];
      const role =
        members === undefined ? 'owner' : members.find((member) => member.login === DEMO_LOGIN)?.role;
      if (role !== 'owner') return refusal(403, 'not_allowed', 'Only the owner can delete the organization.');
      const body = zOrgDeleteConfirm.safeParse(await readJson(request));
      if (!body.success || body.data.confirm !== slugOf(organization))
        return refusal(400, 'invalid_request', "Type the organization's short name to confirm.");
      remove(s, organization);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
