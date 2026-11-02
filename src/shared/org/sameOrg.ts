// SPDX-License-Identifier: AGPL-3.0-only
import { useAuthStore } from '@/shared/auth/authStore';
import { useOrgStore } from '@/shared/org/orgStore';

/**
 * Who a change was sent as, as `onMutate` returns it: the organization's generation (it goes up each time another
 * organization is chosen, here or in another tab) and the account's (a sign-in or sign-out, here or in another tab).
 */
export function sentInOrg(): string {
  return `${String(useOrgStore.getState().generation)}/${String(useAuthStore.getState().generation)}`;
}

/**
 * Runs what a change does with its answer (put it in the cache, say it is saved) only if the organization and the
 * account it was sent as are still the ones on screen. The cache keys carry neither: an answer from the previous
 * one, written after a switch, would show there (audit AUDIT-SECU-WEB-2 B3). Otherwise the answer is left out; the
 * new screens read their own.
 */
export function whenSameOrg(sent: unknown, then: () => void): void {
  if (sent === sentInOrg()) then();
}
