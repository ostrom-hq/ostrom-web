// SPDX-License-Identifier: AGPL-3.0-only
import { useServerStatus } from '@/shared/capabilities';
import { hasFeature } from '@/shared/capabilities/model';
import { NAV_LINKS } from './navigation';

/** The entries the navigation shows: those whose screen the server serves. */
export function useNavLinks(): readonly (typeof NAV_LINKS)[number][] {
  const status = useServerStatus();
  return NAV_LINKS.filter((link) => !('feature' in link) || hasFeature(status, link.feature));
}
