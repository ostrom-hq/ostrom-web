// SPDX-License-Identifier: Apache-2.0
import { renderHook } from '@testing-library/react';
import type { Analytics } from '@/shared/analytics/analytics';
import type { ConsentStatus } from '@/shared/analytics/consent';
import { usePageViews } from '@/shared/analytics/usePageViews';

function fakeAnalytics(): Analytics & { readonly views: string[] } {
  const views: string[] = [];
  const nothing = (): void => undefined;
  return {
    views,
    pageview: (path) => views.push(path),
    capture: nothing,
    identify: nothing,
    forget: nothing,
    reset: nothing,
    flush: nothing,
  };
}

describe('usePageViews', () => {
  it('counts each page once while analytics are accepted, and the current one again after a new yes', () => {
    const analytics = fakeAnalytics();
    const { rerender } = renderHook(
      ({ path, consent }: { path: string; consent: ConsentStatus }) => {
        usePageViews(analytics, path, consent);
      },
      { initialProps: { path: '/', consent: 'unknown' } },
    );
    expect(analytics.views).toEqual([]);

    rerender({ path: '/', consent: 'granted' });
    rerender({ path: '/', consent: 'granted' });
    rerender({ path: '/settings', consent: 'granted' });
    rerender({ path: '/settings', consent: 'unknown' });
    rerender({ path: '/settings', consent: 'granted' });

    expect(analytics.views).toEqual(['/', '/settings', '/settings']);
  });

  it('sends one view when StrictMode runs the effect twice', () => {
    const analytics = fakeAnalytics();
    renderHook(
      () => {
        usePageViews(analytics, '/', 'granted');
      },
      { reactStrictMode: true },
    );

    expect(analytics.views).toEqual(['/']);
  });
});
