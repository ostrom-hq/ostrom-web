// SPDX-License-Identifier: AGPL-3.0-only
import type { GovernanceConfirmation } from '@gen/api/types.gen';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnumLabel } from '@/shared/i18n/enumLabel';
import { formatAbsolute } from '@/shared/lib/time';
import { personName } from '../model';

export interface OutcomeProps {
  readonly confirmation: GovernanceConfirmation;
  /** `expired` for a pending one past its time, before the server says so. */
  readonly status: Exclude<GovernanceConfirmation['status'], 'pending'>;
}

/** How it ended: who answered and when, what the write returned, or why nothing was written. */
export function Outcome({ confirmation, status }: OutcomeProps): ReactElement {
  const { t, i18n } = useTranslation();
  const enumText = useEnumLabel();
  const { answeredBy, answeredAt, result, error } = confirmation;
  const who = answeredBy === undefined ? t('confirm.outcome.someone') : personName(answeredBy);
  const when =
    answeredAt === undefined
      ? ''
      : t('confirm.outcome.at', { when: formatAbsolute(answeredAt, i18n.language) });
  return (
    <section
      className={`o-card ys-receipt cf-outcome cf-outcome--${status}`}
      aria-label={t('confirm.outcome.label')}
    >
      <h2 className="ys-receipt__h">{enumText('confirm.outcome.title', status)}</h2>
      {status === 'expired' ? (
        <p className="ys-small">{t('confirm.outcome.expired')}</p>
      ) : (
        <p className="ys-small">{enumText('confirm.outcome.by', status, { who, when })}</p>
      )}
      {status === 'failed' ? (
        <p className="ys-small">
          {t('confirm.outcome.why', { reason: error?.message ?? t('confirm.outcome.unknown') })}
          {error === undefined ? null : (
            <>
              {' '}
              <code className="o-mono">{error.type}</code>
            </>
          )}
        </p>
      ) : null}
      {status === 'refused' || status === 'expired' || status === 'failed' ? (
        <p className="ys-small ys-meta">{t('confirm.outcome.nothingWritten')}</p>
      ) : null}
      {status === 'confirmed' && result !== undefined && result !== null ? (
        <details className="ys-details">
          <summary>{t('confirm.outcome.result')}</summary>
          <pre className="cf-json">
            <code>{JSON.stringify(result, null, 2)}</code>
          </pre>
        </details>
      ) : null}
    </section>
  );
}
