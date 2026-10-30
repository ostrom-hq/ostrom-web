// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Wipes the fragment from the browser's address and its history entry at once (`history.replaceState`), before
 * anything else runs: a sign-in token there (`#signin=opk_…`, `#token=…`) must not stay in the address bar, the
 * history or a screenshot. The router's own redirect follows; this does not wait for it.
 */
export interface AddressBar {
  readonly location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  readonly history: Pick<History, 'state' | 'replaceState'>;
}

export function dropFragment(target: AddressBar = window): void {
  if (target.location.hash === '') return;
  target.history.replaceState(
    target.history.state,
    '',
    `${target.location.pathname}${target.location.search}`,
  );
}
