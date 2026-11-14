// SPDX-License-Identifier: Apache-2.0
import { useInstanceAdmin } from '@/shared/auth/useInstanceAdmin';
import { useServerStatus } from '@/shared/capabilities';
import { announces, hasFeature } from '@/shared/capabilities/model';
import { NAV_LINKS } from './navigation';

/**
 * The entries the navigation shows: those whose screen the server serves. The instance's administration is shown to
 * an administrator of the instance only, and only once the server has said it serves it.
 */
export function useNavLinks(): readonly (typeof NAV_LINKS)[number][] {
  const status = useServerStatus();
  const instanceAdmin = useInstanceAdmin(false);
  return NAV_LINKS.filter((link) => {
    if ('instanceAdmin' in link) return instanceAdmin === true && announces(status, link.feature);
    return !('feature' in link) || hasFeature(status, link.feature);
  });
}
