// SPDX-License-Identifier: Apache-2.0
import { getMeOptions, listOrgsOptions } from '@gen/api/@tanstack/react-query.gen';
import { useQuery } from '@tanstack/react-query';
import { ready } from '@/shared/api/ready';
import { useOrgStore } from '@/shared/org/orgStore';
import { type OrgRole, orgRoleOf } from '@/shared/org/roles';
import { meInOrgOptions, meOf, viewerName } from './me';

export interface Viewer {
  readonly login: string | undefined;
  /** "Maya Lind (maya)", or the login alone. */
  readonly name: string | undefined;
  /** Their member id (`Member.id`) in the organization: what an artifact's readers are listed by. */
  readonly memberId: string | undefined;
  readonly role: OrgRole | undefined;
  /** Owners and admins change the organization (members, rules, tools); everyone else reads. */
  readonly canManage: boolean;
}

/**
 * The person looking at the console, as the server knows them. Who is signed in comes from `/auth/me`; their member
 * there (id, name, role) only with the organization the console acts in named (ostrom-server#92). Until that answer
 * is in, their role is the one their organization list gives for that same organization (`GET /orgs`, which the
 * organization's screens wait for anyway), so a manager never sees the read-only screen first.
 */
export function useViewer(): Viewer {
  const current = useOrgStore((state) => state.current);
  const signedIn = meOf(useQuery(ready(getMeOptions(), { staleTime: 60_000 })).data);
  const named = meOf(
    useQuery(ready(meInOrgOptions(current), { staleTime: 60_000, enabled: current !== undefined })).data,
  );
  const listed = useQuery(ready(listOrgsOptions(), { staleTime: 60_000 })).data?.items.find(
    (item) => item.id === current,
  );
  const me = named ?? signedIn;
  const role = orgRoleOf(me?.member?.role) ?? orgRoleOf(listed?.role);
  return {
    login: signedIn?.dev.login,
    name: viewerName(me),
    memberId: me?.member?.id,
    role,
    canManage: role === 'owner' || role === 'admin',
  };
}
