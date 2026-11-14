import type { ReactElement } from 'react';
import {
  analytics,
  analyticsConfig,
  ConsentBanner,
  PRIVACY_URL,
  PrivacyChoices,
  useConsentStore,
  usePageViews,
} from '@/shared/analytics';

/** Page views, the privacy choice in the footer and the consent banner: loaded after the first paint (see AppShell). */
export function AnalyticsLayer({ pathname }: { pathname: string }): ReactElement {
  const consent = useConsentStore((state) => state.status);
  usePageViews(analytics, pathname, consent);
  return <ConsentBanner analytics={analytics} configured={analyticsConfig !== null} privacyUrl={PRIVACY_URL} />;
}

/** The footer's privacy choice. */
export function FooterPrivacy(): ReactElement {
  return <PrivacyChoices analytics={analytics} configured={analyticsConfig !== null} />;
}
