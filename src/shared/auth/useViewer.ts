// SPDX-License-Identifier: AGPL-3.0-only
import { getMeOptions } from '@gen/api/@tanstack/react-query.gen';
import type { MemberRole } from '@gen/api/types.gen';
import { useQuery } from '@tanstack/react-query';
import { tuned } from '@/shared/api/tuned';
import { meOf } from './me';

export interface Viewer {
  readonly login: string | undefined;
  readonly role: MemberRole | undefined;
  /** Owners and admins change the organization (members, rules, tools); everyone else reads. */
  readonly canManage: boolean;
}

/** The person looking at the console, as the server knows them; who they are rarely changes in a session. */
export function useViewer(): Viewer {
  const query = useQuery(tuned(getMeOptions(), { staleTime: 60_000 }));
  const me = meOf(query.data);
  const role = me?.member?.role;
  return { login: me?.dev.login, role, canManage: role === 'owner' || role === 'admin' };
}
