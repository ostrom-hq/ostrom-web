// SPDX-License-Identifier: AGPL-3.0-only
import {
  type Analytics,
  type AnalyticsOptions,
  createAnalytics,
  randomId,
  sendWithFetch,
} from '@/shared/analytics/analytics';
import { type AnalyticsConfig, readAnalyticsConfig, readPrivacyUrl } from '@/shared/analytics/config';
import { CONSENT_STORAGE_KEY, useConsentStore } from '@/shared/analytics/consent';
import { safeLocalStorage } from '@/shared/lib/safeStorage';

export { type Analytics, type PropertyValue, pathOnly } from '@/shared/analytics/analytics';
export { ConsentBanner, PrivacyChoices } from '@/shared/analytics/ConsentBanner';
export { useConsentStore, type ConsentStatus } from '@/shared/analytics/consent';
export { usePageViews } from '@/shared/analytics/usePageViews';

/*
 * `window.__OSTROM_CONFIG__` comes from `/config.js`, a classic script that index.html loads before this module: the
 * console image writes it at start (`docker/40-ostrom-config.sh`), `public/config.js` is the empty one of `pnpm dev`.
 * It is therefore set when these lines run.
 */

/** The privacy policy the consent banner links to. */
export const PRIVACY_URL: string = readPrivacyUrl(window.__OSTROM_CONFIG__);

/** Null when the deployment set no PostHog key: no banner, no request. */
export const analyticsConfig: AnalyticsConfig | null = readAnalyticsConfig(
  window.__OSTROM_CONFIG__,
  import.meta.env,
);

/** The browser wiring of the analytics client. */
export function browserAnalyticsOptions(config: AnalyticsConfig | null): AnalyticsOptions {
  return {
    config,
    // Checked on each event: a yes that expires while the tab is open stops there, and the banner shows again.
    consent: () => useConsentStore.getState().current(),
    storage: safeLocalStorage,
    send: sendWithFetch,
    schedule: (task, delayMs) => {
      window.setTimeout(task, delayMs);
    },
    now: () => Date.now(),
    // getRandomValues, unlike randomUUID, also exists when the console is served over plain http.
    newId: () => randomId((bytes) => crypto.getRandomValues(bytes)),
    origin: window.location.origin,
  };
}

/** The console's analytics; events follow ostrom-core `docs/telemetry.md`. */
export const analytics: Analytics = createAnalytics(browserAnalyticsOptions(analyticsConfig));

// A choice made in another tab applies here too; a withdrawal there also forgets this tab's browser id.
window.addEventListener('storage', (event) => {
  if (event.key !== CONSENT_STORAGE_KEY && event.key !== null) return;
  const store = useConsentStore.getState();
  store.sync();
  if (useConsentStore.getState().status !== 'granted') analytics.forget();
});

// The last events leave when the tab is hidden or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') analytics.flush();
});
