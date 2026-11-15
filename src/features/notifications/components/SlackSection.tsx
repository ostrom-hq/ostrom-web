// SPDX-License-Identifier: Apache-2.0
import type { ReactElement } from 'react';
import { useAnnounced } from '@/shared/capabilities';
import { useTranslation } from '@/shared/i18n/useTranslation';
import { Badge } from '@/shared/ui/Badge';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { LoadState, Section } from '@/shared/ui/Screen';
import { slackRefusalOf } from '../model';
import { useSlackLink } from '../useNotifications';

/**
 * The member's Slack account (`slack.v1`): their notifications and the requests for their yes arrive there as direct
 * messages. The server finds the account by the member's proven e-mail address: nobody types a Slack id, so nobody
 * links another person's account.
 */
export function SlackSection(): ReactElement | null {
  const { t } = useTranslation();
  // Nothing is asked of a server that has not said it serves this.
  const served = useAnnounced('slack.v1');
  const view = useSlackLink(served);
  if (!served) return null;
  return (
    <Section id="slack" label={t('notifications.slack.title')}>
      <p className="o-screen__lead">{t('notifications.slack.lead')}</p>
      <LoadState data={view.link} failure={view.failure} rows={1}>
        {(link) =>
          link.linked ? (
            <>
              <p className="o-inline">
                <Badge tone="success">{t('notifications.slack.linkedTag')}</Badge>{' '}
                {t('notifications.slack.linked')}
              </p>
              <span className="o-self-start">
                <Button onClick={view.disconnect} disabled={view.busy}>
                  {t('notifications.slack.unlink')}
                </Button>
              </span>
            </>
          ) : link.configured ? (
            <>
              <p>{t('notifications.slack.invite')}</p>
              <span className="o-self-start">
                <Button onClick={view.connect} disabled={view.busy}>
                  {view.busy ? t('notifications.slack.linking') : t('notifications.slack.link')}
                </Button>
              </span>
            </>
          ) : (
            <p className="o-empty">{t('notifications.slack.notConfigured')}</p>
          )
        }
      </LoadState>
      {view.actionFailure === undefined ? null : <Refused failure={view.actionFailure} />}
    </Section>
  );
}

function Refused({ failure }: { readonly failure: Error }): ReactElement {
  const { t } = useTranslation();
  const refusal = slackRefusalOf(failure);
  return (
    <Banner tone="danger" tag={t('notifications.slack.errorTag')} live>
      {refusal === undefined ? (
        <FailureText failure={failure} />
      ) : (
        t(`notifications.slack.refusal.${refusal}`)
      )}
    </Banner>
  );
}
