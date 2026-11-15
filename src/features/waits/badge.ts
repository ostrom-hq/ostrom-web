// SPDX-License-Identifier: Apache-2.0
// Apart from model.ts: the navigation's badge is in the first download, the rest of the model is not.

/** The page size the badge in the navigation reads: the largest page. */
export const BADGE_PAGE = 100;

/** The badge's count: a page that has more says so ("100+"). */
export function countLabel(count: number, more: boolean): string {
  return more ? `${String(count)}+` : String(count);
}
