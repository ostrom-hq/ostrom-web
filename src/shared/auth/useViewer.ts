// SPDX-License-Identifier: AGPL-3.0-only
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import type { MemberRole } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { ready } from '@/shared/api/ready';
import { meOf, viewerName } from './me';

export interface Viewer {
  readonly login: string | undefined;
  /** "Maya Lind (maya)", or the login alone. */
  readonly name: string | undefined;
  /** How they signed in (`github`, `google`, `email`…): signing in again goes the same way. */
  readonly via: string | undefined;
  readonly role: MemberRole | undefined;
  /** Owners and admins change the organization (members, rules, tools); everyone else reads. */
  readonly canManage: boolean;
}

/** The person looking at the console, as the server knows them; who they are rarely changes in a session. */
export function useViewer(): Viewer {
  const query = useQuery(ready(getMeOptions(), { staleTime: 60_000 }));
  const me = meOf(query.data);
  const role = me?.member?.role;
  return {
    login: me?.dev.login,
    name: viewerName(me),
    via: me?.dev.via,
    role,
    canManage: role === 'owner' || role === 'admin',
  };
}
