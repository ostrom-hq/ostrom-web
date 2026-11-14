// SPDX-License-Identifier: Apache-2.0
import { useQuery } from '@tanstack/react-query';
import { ready } from '@/shared/api/ready';
import { meInOrgOptions, meOf } from '@/shared/auth/me';
import { useInstanceAdmin } from '@/shared/auth/useInstanceAdmin';
import { useServerStatus } from '@/shared/capabilities';
import { announces, hasFeature } from '@/shared/capabilities/model';
import { useOrgStore } from '@/shared/org/orgStore';
import { managesMembers, orgRoleOf } from '@/shared/org/roles';
import { NAV_LINKS } from './navigation';

/**
 * The entries the navigation shows: those whose screen the server serves. The instance's administration is shown to
 * an administrator of the instance only, and only once the server has said it serves it. An owner's or an admin's
 * screen is shown to an owner or an admin of the organization the console acts in, by their member there (`/auth/me`
 * with the organization named, read from the cache: the top bar asks for it, never this).
 */
export function useNavLinks(): readonly (typeof NAV_LINKS)[number][] {
  const status = useServerStatus();
  const instanceAdmin = useInstanceAdmin(false);
  const current = useOrgStore((state) => state.current);
  const me = useQuery(ready(meInOrgOptions(current), { staleTime: 60_000, enabled: false }));
  const manages = managesMembers(orgRoleOf(meOf(me.data)?.member?.role));
  return NAV_LINKS.filter((link) => {
    if ('instanceAdmin' in link) return instanceAdmin === true && announces(status, link.feature);
    if ('adminOnly' in link && !manages) return false;
    return !('feature' in link) || hasFeature(status, link.feature);
  });
}
