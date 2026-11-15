// SPDX-License-Identifier: Apache-2.0
import { useSyncExternalStore } from 'react';

/** Where shell.css hides the bar and shows the menu: keep both the same. */
export const PHONE_QUERY = '(max-width: 640px)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

function isPhone(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/**
 * Whether the screen is a phone's, where the bar has no room for the navigation and the menu shows it. The bar is then
 * not rendered at all, rather than rendered and hidden: its forty links cost a slow phone's CPU before the first paint
 * (e2e-real/vitals.spec.ts). It comes back when the screen widens (a phone turned, a window resized).
 */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, isPhone);
}
