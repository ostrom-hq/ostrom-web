// SPDX-License-Identifier: AGPL-3.0-only
import { useOrgStore } from '@/shared/org/orgStore';

/**
 * Which organization a change was sent in, as `onMutate` returns it: the store's generation, which goes up each time
 * another organization is chosen (here or in another tab).
 */
export function sentInOrg(): number {
  return useOrgStore.getState().generation;
}

/**
 * Puts a change's answer in the cache only if the organization it was sent in is still the one on screen. The cache
 * keys carry no organization: an answer from the previous one, written after a switch, would show there (audit
 * AUDIT-SECU-WEB-2 B3). Otherwise the answer is left out; the new organization's screens read their own.
 */
export function whenSameOrg(sent: unknown, write: () => void): void {
  if (sent === useOrgStore.getState().generation) write();
}
