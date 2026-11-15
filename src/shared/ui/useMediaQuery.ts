// SPDX-License-Identifier: Apache-2.0
import { useCallback, useSyncExternalStore } from 'react';

/** Whether the screen matches a media query (`(prefers-color-scheme: dark)`), followed as it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
