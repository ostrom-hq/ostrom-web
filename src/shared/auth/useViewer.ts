// SPDX-License-Identifier: AGPL-3.0-only
import type { MemberRole } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { ready } from '@/shared/api/ready';
import { useOrgStore } from '@/shared/org/orgStore';
import { meInOrgOptions, meOf, viewerName } from './me';

export interface Viewer {
  readonly login: string | undefined;
  /** "Maya Lind (maya)", or the login alone. */
  readonly name: string | undefined;
  /** Their member id (`Member.id`) in the organization: what an artifact's readers are listed by. */
  readonly memberId: string | undefined;
  readonly role: MemberRole | undefined;
  /** Owners and admins change the organization (members, rules, tools); everyone else reads. */
  readonly canManage: boolean;
}

/**
 * The person looking at the console, as the server knows them in the organization the console acts in: their member
 * (id, name, role) only comes with that organization named. Who they are rarely changes in a session.
 */
export function useViewer(): Viewer {
  const current = useOrgStore((state) => state.current);
  const query = useQuery(ready(meInOrgOptions(current), { staleTime: 60_000 }));
  const me = meOf(query.data);
  const role = me?.member?.role;
  return {
    login: me?.dev.login,
    name: viewerName(me),
    memberId: me?.member?.id,
    role,
    canManage: role === 'owner' || role === 'admin',
  };
}
