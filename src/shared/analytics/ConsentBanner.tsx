import { type ReactElement, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Analytics } from '@/shared/analytics/analytics';
import { useConsentStore } from '@/shared/analytics/consent';
import { Button } from '@/shared/ui/Button';

export interface ConsentBannerProps {
  readonly analytics: Analytics;
  /** False when no PostHog key is set: nothing is measured, so nothing is asked. */
  readonly configured: boolean;
  readonly privacyUrl: string;
}

/**
 * Asks before measuring anything (RGPD, CNIL guidelines on trackers): Accept and Refuse are the same kind of button,
 * side by side, and closing the tab without choosing sends nothing.
 */
export function ConsentBanner({
  analytics,
  configured,
  privacyUrl,
}: ConsentBannerProps): ReactElement | null {
  const { t } = useTranslation();
  const status = useConsentStore((state) => state.status);
  const reopened = useConsentStore((state) => state.reopened);
  const decide = useConsentStore((state) => state.decide);
  const region = useRef<HTMLElement>(null);
  const shown = configured && status === 'unknown';
  // Asked for from the footer, the banner takes the focus; shown on arrival, it leaves the focus where it is.
  useEffect(() => {
    if (shown && reopened) region.current?.focus();
  }, [shown, reopened]);
  if (!shown) return null;
  return (
    <section ref={region} tabIndex={-1} className="o-consent" aria-labelledby="o-consent-title">
      <h2 id="o-consent-title" className="o-consent__title">
        {t('consent.title')}
      </h2>
      <p className="o-consent__body">
        {t('consent.body')} <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
          {t('consent.learnMore')}
        </a>
      </p>
      <div className="o-consent__actions">
        <Button
          onClick={() => {
            analytics.forget();
            decide(false);
          }}
        >
          {t('consent.refuse')}
        </Button>
        <Button
          onClick={() => {
            decide(true);
            analytics.capture('consent_updated', { analytics: true });
          }}
        >
          {t('consent.accept')}
        </Button>
      </div>
    </section>
  );
}

export interface PrivacyChoicesProps {
  readonly analytics: Analytics;
  readonly configured: boolean;
}

/** The footer link that withdraws the choice and reopens the banner: withdrawing a yes is as easy as giving it. */
export function PrivacyChoices({ analytics, configured }: PrivacyChoicesProps): ReactElement | null {
  const { t } = useTranslation();
  const reopen = useConsentStore((state) => state.reopen);
  if (!configured) return null;
  return (
    <button
      type="button"
      className="o-linkbtn"
      onClick={() => {
        analytics.forget();
        reopen();
      }}
    >
      {t('consent.manage')}
    </button>
  );
}
