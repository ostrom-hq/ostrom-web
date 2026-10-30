import {
  type Analytics,
  type AnalyticsOptions,
  createAnalytics,
  sendWithFetch,
} from '@/shared/analytics/analytics';
import { type AnalyticsConfig, readAnalyticsConfig } from '@/shared/analytics/config';
import { useConsentStore } from '@/shared/analytics/consent';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

export { type Analytics, type PropertyValue, pathOnly } from '@/shared/analytics/analytics';
export { ConsentBanner, PrivacyChoices } from '@/shared/analytics/ConsentBanner';
export { useConsentStore, type ConsentStatus } from '@/shared/analytics/consent';

/** The privacy policy of the hosted service. */
export const PRIVACY_URL = 'https://ostrom.run/privacy';

/** Null when the deployment set no PostHog key: no banner, no request. */
export const analyticsConfig: AnalyticsConfig | null = readAnalyticsConfig(
  window.__OSTROM_CONFIG__,
  import.meta.env,
);

/** The browser wiring of the analytics client. */
export function browserAnalyticsOptions(config: AnalyticsConfig | null): AnalyticsOptions {
  return {
    config,
    consent: () => useConsentStore.getState().status,
    storage: safeLocalStorage,
    send: sendWithFetch,
    schedule: (task, delayMs) => {
      window.setTimeout(task, delayMs);
    },
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    origin: window.location.origin,
  };
}

/** The console's analytics; events follow ostrom-core `docs/telemetry.md`. */
export const analytics: Analytics = createAnalytics(browserAnalyticsOptions(analyticsConfig));

// The last events leave when the tab is hidden or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') analytics.flush();
});
