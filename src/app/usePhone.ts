// SPDX-License-Identifier: Apache-2.0
import { useMediaQuery } from '@/shared/ui/useMediaQuery';

/** Where shell.css shows the menu instead of the bar: keep both the same. */
export const PHONE_QUERY = '(max-width: 640px)';

/**
 * Whether the screen is a phone's, where the bar has no room for the navigation and the menu shows it. The bar is then
 * not rendered at all, rather than rendered and hidden: its links cost a slow phone's CPU before the first paint
 * (e2e-real/vitals.spec.ts). It comes back when the screen widens (a phone turned, a window resized).
 */
export function usePhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
