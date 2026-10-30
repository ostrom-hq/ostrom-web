import type { ReactElement } from 'react';
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
  const decide = useConsentStore((state) => state.decide);
  if (!configured || status !== 'unknown') return null;
  return (
    <section className="o-consent" aria-labelledby="o-consent-title">
      <h2 id="o-consent-title" className="o-consent__title">
        {t('consent.title')}
      </h2>
      <p className="o-consent__body">
        {t('consent.body')} <a href={privacyUrl}>{t('consent.learnMore')}</a>
      </p>
      <div className="o-consent__actions">
        <Button
          onClick={() => {
            decide(false);
            analytics.forget();
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
  readonly configured: boolean;
}

/** The footer link that reopens the banner: withdrawing a yes is as easy as giving it. */
export function PrivacyChoices({ configured }: PrivacyChoicesProps): ReactElement | null {
  const { t } = useTranslation();
  const reopen = useConsentStore((state) => state.reopen);
  if (!configured) return null;
  return (
    <button type="button" className="o-linkbtn" onClick={reopen}>
      {t('consent.manage')}
    </button>
  );
}
