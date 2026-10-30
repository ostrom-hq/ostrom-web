// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef } from 'react';
import type { Analytics } from '@/shared/analytics/analytics';
import type { ConsentStatus } from '@/shared/analytics/consent';

/**
 * A page view per route, and one for the current page right after a yes; never twice for the same page (a second
 * render, React's StrictMode, a choice synced from another tab).
 */
export function usePageViews(analytics: Analytics, pathname: string, consent: ConsentStatus): void {
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (consent !== 'granted') {
      viewed.current = null;
    } else if (viewed.current !== pathname) {
      viewed.current = pathname;
      analytics.pageview(pathname);
    }
  }, [analytics, pathname, consent]);
}
