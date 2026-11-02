// SPDX-License-Identifier: AGPL-3.0-only
import {
  DEFAULT_POSTHOG_HOST,
  DEFAULT_PRIVACY_URL,
  readAnalyticsConfig,
  readPrivacyUrl,
} from '@/shared/analytics/config';

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

describe('readPrivacyUrl', () => {
  it('is the deployment one, or the hosted service one', () => {
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: 'https://corp.example/privacy' })).toBe(
      'https://corp.example/privacy',
    );
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: ' ' })).toBe(DEFAULT_PRIVACY_URL);
    expect(readPrivacyUrl(undefined)).toBe('https://ostrom.run/privacy');
  });

  it('never makes a link of an address that is not http(s): it would run in the console at the click', () => {
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: 'javascript:alert(document.domain)' })).toBe(
      DEFAULT_PRIVACY_URL,
    );
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: 'data:text/html,<script>1</script>' })).toBe(
      DEFAULT_PRIVACY_URL,
    );
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: 'http://[::1' })).toBe(DEFAULT_PRIVACY_URL);
  });

  it('takes a path as one on the console site', () => {
    expect(readPrivacyUrl({ OSTROM_PRIVACY_URL: '/legal/privacy' }, 'https://console.acme.dev')).toBe(
      'https://console.acme.dev/legal/privacy',
    );
  });
});
