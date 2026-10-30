import { DEFAULT_POSTHOG_HOST, readAnalyticsConfig } from '@/shared/analytics/config';

describe('readAnalyticsConfig', () => {
  it('is off without a key, so that a self-hosted console asks nothing and sends nothing', () => {
    expect(readAnalyticsConfig(undefined, {})).toBeNull();
    expect(readAnalyticsConfig({ OSTROM_POSTHOG_API_KEY: '  ' }, { VITE_POSTHOG_KEY: '' })).toBeNull();
  });

  it('prefers the runtime settings of the image over the build ones', () => {
    const config = readAnalyticsConfig(
      { OSTROM_POSTHOG_API_KEY: 'phc_runtime', OSTROM_POSTHOG_HOST: 'https://ph.example/' },
      { VITE_POSTHOG_KEY: 'phc_build', VITE_POSTHOG_HOST: 'https://build.example' },
    );
    expect(config).toEqual({ key: 'phc_runtime', host: 'https://ph.example' });
  });

  it('falls back to the build settings, then to PostHog Cloud EU', () => {
    expect(
      readAnalyticsConfig(undefined, { VITE_POSTHOG_KEY: 'phc_b', VITE_POSTHOG_HOST: 'https://b.example' }),
    ).toEqual({ key: 'phc_b', host: 'https://b.example' });
    expect(readAnalyticsConfig({ OSTROM_POSTHOG_API_KEY: 'phc_r' }, {})).toEqual({
      key: 'phc_r',
      host: DEFAULT_POSTHOG_HOST,
    });
  });
});
