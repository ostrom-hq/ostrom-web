// SPDX-License-Identifier: Apache-2.0
import { useOrgStore } from '@/shared/org/orgStore';

/**
 * Goes up each time this tab learns that the account in the cookie changed: a sign-in or sign-out here, or one in
 * another tab (the cookie is the browser's). The auth store's generation only moves in the tab that did it.
 */
let accounts = 0;

/** The account changed, here or in another tab (App.tsx calls it on both). */
export function accountChanged(): void {
  accounts += 1;
}

/**
 * Who a change was sent as, as `onMutate` returns it: the organization's generation (it goes up each time another
 * organization is chosen, here or in another tab) and the account's.
 */
export function sentInOrg(): string {
  return `${String(useOrgStore.getState().generation)}/${String(accounts)}`;
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
