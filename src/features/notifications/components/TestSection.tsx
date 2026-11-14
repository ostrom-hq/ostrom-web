// SPDX-License-Identifier: Apache-2.0
import type { PushTestResults } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnounced } from '@/shared/capabilities';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { FailureText } from '@/shared/ui/FailureText';
import { Section } from '@/shared/ui/Screen';
import { sentCount, testRefusalOf } from '../model';
import { useTestPush } from '../useNotifications';

/**
 * "Send a test to my phone" (`notifications.push.test.v1`): one test notification to each of the member's phones in
 * this organization, with each installation's result. Any member may, not only the administrators.
 */
export function TestSection(): ReactElement | null {
  const { t } = useTranslation();
  const served = useAnnounced('notifications.push.test.v1');
  const view = useTestPush();
  if (!served) return null;
  return (
    <Section label={t('notifications.test.title')}>
      <p className="o-screen__lead">{t('notifications.test.lead')}</p>
      <div className="o-inline">
        <Button disabled={view.sending} onClick={view.send}>
          {view.sending ? t('notifications.test.sending') : t('notifications.test.send')}
        </Button>
      </div>
      {view.results === undefined ? null : <Outcome results={view.results} />}
      {view.failure === undefined ? null : <Refused failure={view.failure} />}
    </Section>
  );
}

function Outcome({ results }: { readonly results: PushTestResults }): ReactElement {
  const { t } = useTranslation();
  const label = useEnumLabel();
  const sent = sentCount(results);
  return (
    <div className="o-stack">
      {results.ok ? (
        <Banner tag={t('notifications.test.sentTag')} live>
          {t('notifications.test.sent', { count: sent })}
        </Banner>
      ) : (
        <Banner tone="warning" tag={t('notifications.test.undeliveredTag')} live>
          {t('notifications.test.undelivered')}
        </Banner>
      )}
      <ul className="o-rows" aria-label={t('notifications.test.results')}>
        {results.results.map((result, index) => (
          // The server names no installation: its place in one answer, never reordered, is its identity.
          <li key={`${String(index)}-${result.status}`} className="o-row">
            <span className="o-row__main">
              <span className="o-row__title">
                {t('notifications.test.phone', { number: String(index + 1) })}
              </span>
              <span className="o-row__meta">
                <span>{label('notifications.test.status', result.status)}</span>
                {result.error === undefined ? null : (
                  <>
                    {' · '}
                    <code className="o-mono">{result.error}</code>
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Refused({ failure }: { readonly failure: Error }): ReactElement {
  const { t } = useTranslation();
  const refusal = testRefusalOf(failure);
  return (
    <Banner tone={refusal === undefined ? 'danger' : 'warning'} tag={t('notifications.test.notSentTag')} live>
      {refusal === undefined ? <FailureText failure={failure} /> : t(`notifications.test.refusal.${refusal}`)}
    </Banner>
  );
}
